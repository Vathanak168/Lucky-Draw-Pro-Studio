/**
 * Asta Studio Gatekeeper Web App
 *
 * Deploy as a Google Apps Script web app:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * The desktop client only uses the JSON request, check, and password-sync APIs.
 * Admin actions run through google.script.run after a role token is validated.
 */

const ASTA_AUTH = Object.freeze({
  APP_NAME: "Asta Studio",
  APP_VERSION: "6.0.0",
  SUPER_ADMIN_EMAIL: "chhaysereyvathanak@gmail.com",
  REQUEST_PREFIX: "REQ_",
  STATUS_PREFIX: "STATUS_",
  ADMIN_EMAILS_KEY: "AUTHORIZED_ADMIN_EMAILS",
  ADMIN_TOKEN_PREFIX: "ADMIN_ACCESS_TOKEN_",
  SUPER_TOKEN_KEY: "SUPER_ADMIN_ACCESS_TOKEN",
  PASSWORD_HASH_KEY: "GLOBAL_MASTER_PASSWORD_HASH",
  LEGACY_PASSWORD_KEY: "GLOBAL_MASTER_PASSWORD",
  PASSWORD_VERSION_KEY: "GLOBAL_PASSWORD_VERSION",
  NOTIFICATIONS_KEY: "REQUEST_NOTIFICATIONS_ENABLED",
  AUDIT_LOG_KEY: "ADMIN_AUDIT_LOG",
  MAX_REQUESTS: 250,
  MAX_AUDIT_EVENTS: 100,
});


function doPost(e) {
  try {
    const data = parseRequestBody_(e);
    const action = String(data.action || "").trim().toLowerCase();
    const props = PropertiesService.getScriptProperties();

    if (action === "request") {
      return jsonOutput_(handleAccessRequest_(data, props));
    }
    if (action === "check") {
      return jsonOutput_(checkRemoteStatus_(data.machine_id, props));
    }
    if (action === "service_status") {
      return jsonOutput_({ status: "OK", ...getPasswordVersionPayload_(props) });
    }
    if (action === "verify_password") {
      return jsonOutput_(verifyPassword_(data.password, props));
    }

    return jsonOutput_({ status: "ERROR", message: "Unknown POST action" });
  } catch (error) {
    return jsonOutput_({ status: "ERROR", message: errorMessage_(error) });
  }
}


function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || "").trim().toLowerCase();
    const view = String((e && e.parameter && e.parameter.view) || "").trim().toLowerCase();
    const props = PropertiesService.getScriptProperties();

    if (action === "portal" || view === "admin") {
      return renderAdminWebApp_();
    }

    return jsonOutput_({
      status: "OK",
      service: "Asta Studio Gatekeeper",
      version: ASTA_AUTH.APP_VERSION,
    });
  } catch (error) {
    return jsonOutput_({ status: "ERROR", message: errorMessage_(error) });
  }
}


function getAdminDashboardState(accessToken) {
  const props = PropertiesService.getScriptProperties();
  const actor = requireAuthorizedActor_(accessToken, props);
  return buildDashboardState_(actor, props);
}


function runAdminAction(accessToken, machineId, action, durationSeconds) {
  const props = PropertiesService.getScriptProperties();
  const actor = requireAuthorizedActor_(accessToken, props);
  const normalizedMachineId = normalizeMachineId_(machineId);
  const normalizedAction = String(action || "").trim().toLowerCase();
  const request = getRequest_(normalizedMachineId, props);

  if (!request) {
    throw new Error("Request not found");
  }

  if (normalizedAction === "confirm") {
    props.setProperty(statusKey_(normalizedMachineId), "APPROVED");
    updateRequest_(normalizedMachineId, { status: "CONFIRMED", updated_at: Date.now() }, props);
    recordAudit_(props, actor, "CONFIRM", normalizedMachineId);
  } else if (normalizedAction === "block") {
    const duration = normalizeBlockDuration_(durationSeconds);
    props.setProperty(statusKey_(normalizedMachineId), `BLOCKED:${duration}`);
    updateRequest_(normalizedMachineId, {
      status: "BLOCKED",
      block_duration: duration,
      updated_at: Date.now(),
    }, props);
    recordAudit_(props, actor, `BLOCK_${duration}`, normalizedMachineId);
  } else if (normalizedAction === "unblock") {
    props.deleteProperty(statusKey_(normalizedMachineId));
    updateRequest_(normalizedMachineId, {
      status: "PENDING",
      block_duration: 0,
      updated_at: Date.now(),
    }, props);
    recordAudit_(props, actor, "UNBLOCK", normalizedMachineId);
  } else {
    throw new Error("Unsupported Admin action");
  }

  return buildDashboardState_(actor, props);
}


function setRequestNotifications(accessToken, enabled) {
  const props = PropertiesService.getScriptProperties();
  const actor = requireSuperAdmin_(accessToken, props);
  const nextValue = enabled === true;
  props.setProperty(ASTA_AUTH.NOTIFICATIONS_KEY, nextValue ? "true" : "false");
  recordAudit_(props, actor, nextValue ? "NOTIFICATIONS_ON" : "NOTIFICATIONS_OFF", "SYSTEM");
  return buildDashboardState_(actor, props);
}


function changeGlobalPassword(accessToken, newPassword) {
  const props = PropertiesService.getScriptProperties();
  const actor = requireSuperAdmin_(accessToken, props);
  const password = String(newPassword || "");

  if (password.length < 6 || password.length > 128) {
    throw new Error("Password must contain 6 to 128 characters");
  }

  const version = Date.now();
  props.setProperty(ASTA_AUTH.PASSWORD_HASH_KEY, sha256Hex_(password));
  props.setProperty(ASTA_AUTH.PASSWORD_VERSION_KEY, String(version));
  props.deleteProperty(ASTA_AUTH.LEGACY_PASSWORD_KEY);
  recordAudit_(props, actor, "PASSWORD_CHANGED", "SYSTEM");

  return {
    ok: true,
    password_version: version,
    dashboard: buildDashboardState_(actor, props),
  };
}


function verifyPassword_(password, props) {
  const payload = getPasswordPayload_(props);
  const candidateHash = sha256Hex_(String(password || ""));
  return {
    status: "OK",
    verified: candidateHash === payload.global_password_hash,
    password_version: payload.password_version,
  };
}


function addAuthorizedAdmin(accessToken, email) {
  const props = PropertiesService.getScriptProperties();
  const actor = requireSuperAdmin_(accessToken, props);
  const normalizedEmail = normalizeEmail_(email);

  if (normalizedEmail === ASTA_AUTH.SUPER_ADMIN_EMAIL.toLowerCase()) {
    return buildDashboardState_(actor, props);
  }

  const admins = getAdditionalAdminEmails_(props);
  if (admins.indexOf(normalizedEmail) === -1) {
    admins.push(normalizedEmail);
    props.setProperty(ASTA_AUTH.ADMIN_EMAILS_KEY, admins.join(","));
    getAccessTokenForEmail_(normalizedEmail, props);
    recordAudit_(props, actor, "ADMIN_ADDED", normalizedEmail);
  }

  return buildDashboardState_(actor, props);
}


function removeAuthorizedAdmin(accessToken, email) {
  const props = PropertiesService.getScriptProperties();
  const actor = requireSuperAdmin_(accessToken, props);
  const normalizedEmail = normalizeEmail_(email);

  if (normalizedEmail === ASTA_AUTH.SUPER_ADMIN_EMAIL.toLowerCase()) {
    throw new Error("Super Admin cannot be removed");
  }

  const admins = getAdditionalAdminEmails_(props).filter(function(item) {
    return item !== normalizedEmail;
  });
  props.setProperty(ASTA_AUTH.ADMIN_EMAILS_KEY, admins.join(","));
  props.deleteProperty(adminTokenKey_(normalizedEmail));
  recordAudit_(props, actor, "ADMIN_REMOVED", normalizedEmail);
  return buildDashboardState_(actor, props);
}


function handleAccessRequest_(data, props) {
  const machineId = normalizeMachineId_(data.machine_id);
  const clientName = normalizeLabel_(data.client_name || "Event Computer", 80);
  const now = Date.now();
  const request = {
    machine_id: machineId,
    client_name: clientName,
    status: "PENDING",
    timestamp: normalizeTimestamp_(data.timestamp, now),
    updated_at: now,
    block_duration: 0,
  };

  props.setProperty(requestKey_(machineId), JSON.stringify(request));
  props.setProperty(statusKey_(machineId), "PENDING");
  trimOldRequests_(props);

  const notificationsEnabled = areRequestNotificationsEnabled_(props);
  const delivery = notificationsEnabled
    ? sendAccessRequestEmails_(request, props)
    : { sent_to: [], failed_to: [], suppressed: true };

  return {
    status: "SUCCESS",
    request_status: "PENDING",
    notifications_enabled: notificationsEnabled,
    notification_suppressed: delivery.suppressed === true,
    sent_to: delivery.sent_to,
    failed_to: delivery.failed_to,
  };
}


function checkRemoteStatus_(machineId, props) {
  const normalizedMachineId = normalizeMachineId_(machineId);
  const rawStatus = props.getProperty(statusKey_(normalizedMachineId)) || "PENDING";
  const passwordPayload = getPasswordVersionPayload_(props);

  if (rawStatus.indexOf("BLOCKED:") === 0) {
    const duration = normalizeBlockDuration_(rawStatus.split(":")[1]);
    return {
      approved: false,
      blocked: true,
      duration: duration,
      message: "Access blocked by Admin",
      ...passwordPayload,
    };
  }

  if (rawStatus === "APPROVED") {
    props.setProperty(statusKey_(normalizedMachineId), "CONSUMED");
    updateRequest_(normalizedMachineId, { status: "CONFIRMED", updated_at: Date.now() }, props);
    return {
      approved: true,
      message: "Access confirmed by Admin",
      ...passwordPayload,
    };
  }

  return {
    approved: false,
    message: rawStatus === "CONSUMED" ? "Approval already used" : "Awaiting Admin confirmation",
    ...passwordPayload,
  };
}


function sendAccessRequestEmails_(request, props) {
  const scriptUrl = ScriptApp.getService().getUrl();
  const sentTo = [];
  const failedTo = [];

  getAllAuthorizedEmails_(props).forEach(function(email) {
    try {
      const role = email === ASTA_AUTH.SUPER_ADMIN_EMAIL.toLowerCase() ? "Super Admin" : "Admin";
      const accessToken = getAccessTokenForEmail_(email, props);
      const portalUrl = `${scriptUrl}?view=admin#access_token=${encodeURIComponent(accessToken)}&machine_id=${encodeURIComponent(request.machine_id)}`;
      const clientName = escapeEmailHtml_(request.client_name);
      const machineId = escapeEmailHtml_(request.machine_id);
      const requestedAt = escapeEmailHtml_(formatEmailTimestamp_(request.timestamp));
      const roleLabel = escapeEmailHtml_(role);

      const htmlBody = `
        <div style="margin:0;padding:24px;background:#05080d;color:#f4f8ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;margin:0 auto;border-collapse:collapse;background:#0a1119;border:1px solid #213244;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:20px 22px;border-bottom:1px solid #213244;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td style="width:38px;vertical-align:middle;">
                      <div style="width:34px;height:34px;line-height:34px;text-align:center;border:1px solid #12cfff;border-radius:7px;background:#08111b;color:#ffffff;font-size:15px;font-weight:700;">A</div>
                    </td>
                    <td style="vertical-align:middle;color:#ffffff;font-size:16px;font-weight:600;">Asta Studio</td>
                    <td style="vertical-align:middle;text-align:right;color:#12cfff;font-size:11px;font-weight:600;">${roleLabel}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px;">
                <div style="margin-bottom:18px;color:#ffffff;font-size:18px;font-weight:600;">Access Request</div>
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#07101a;border:1px solid #1b2a39;border-radius:7px;">
                  <tr>
                    <td style="padding:13px 14px;color:#7f95aa;font-size:12px;border-bottom:1px solid #1b2a39;">Operator</td>
                    <td style="padding:13px 14px;color:#f4f8ff;font-size:13px;text-align:right;border-bottom:1px solid #1b2a39;">${clientName}</td>
                  </tr>
                  <tr>
                    <td style="padding:13px 14px;color:#7f95aa;font-size:12px;border-bottom:1px solid #1b2a39;">Machine ID</td>
                    <td style="padding:13px 14px;color:#ffb340;font-family:Consolas,monospace;font-size:12px;text-align:right;border-bottom:1px solid #1b2a39;">${machineId}</td>
                  </tr>
                  <tr>
                    <td style="padding:13px 14px;color:#7f95aa;font-size:12px;">Requested</td>
                    <td style="padding:13px 14px;color:#f4f8ff;font-size:12px;text-align:right;">${requestedAt}</td>
                  </tr>
                </table>
                <div style="margin-top:20px;">
                  <a href="${portalUrl}" style="display:block;padding:13px 18px;border-radius:7px;background:#087d9c;border:1px solid #12cfff;color:#ffffff;font-size:14px;font-weight:600;text-align:center;text-decoration:none;">Review Request</a>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:13px 22px;border-top:1px solid #213244;color:#5f7488;font-size:11px;text-align:center;">Asta Studio ${ASTA_AUTH.APP_VERSION}</td>
            </tr>
          </table>
        </div>`;

      MailApp.sendEmail({
        to: email,
        name: "Asta Studio",
        subject: `Asta Studio Access Request - ${request.client_name}`,
        htmlBody: htmlBody,
      });
      sentTo.push(email);
    } catch (error) {
      failedTo.push({ email: email, error: errorMessage_(error) });
    }
  });

  return { sent_to: sentTo, failed_to: failedTo, suppressed: false };
}


function buildDashboardState_(actor, props) {
  const requests = listRequests_(props);
  const superAdmin = actor.role === "superadmin";
  return {
    app_name: ASTA_AUTH.APP_NAME,
    app_version: ASTA_AUTH.APP_VERSION,
    role: actor.role,
    actor_email: actor.email,
    notifications_enabled: areRequestNotificationsEnabled_(props),
    requests: requests,
    counts: {
      all: requests.length,
      pending: requests.filter(function(item) { return item.status === "PENDING"; }).length,
      confirmed: requests.filter(function(item) { return item.status === "CONFIRMED"; }).length,
      blocked: requests.filter(function(item) { return item.status === "BLOCKED"; }).length,
    },
    password_version: superAdmin ? getPasswordPayload_(props).password_version : null,
    administrators: superAdmin ? getAllAuthorizedEmails_(props).map(function(email) {
      return {
        email: email,
        role: email === ASTA_AUTH.SUPER_ADMIN_EMAIL.toLowerCase() ? "superadmin" : "admin",
      };
    }) : [],
    audit_log: superAdmin ? getAuditLog_(props) : [],
  };
}


function listRequests_(props) {
  const all = props.getProperties();
  return Object.keys(all)
    .filter(function(key) { return key.indexOf(ASTA_AUTH.REQUEST_PREFIX) === 0; })
    .map(function(key) {
      try {
        const request = JSON.parse(all[key]);
        const machineId = normalizeMachineId_(request.machine_id || key.slice(ASTA_AUTH.REQUEST_PREFIX.length));
        const rawStatus = all[statusKey_(machineId)] || request.status || "PENDING";
        const status = normalizeDashboardStatus_(rawStatus);
        const blockDuration = rawStatus.indexOf("BLOCKED:") === 0
          ? normalizeBlockDuration_(rawStatus.split(":")[1])
          : Number(request.block_duration || 0);
        return {
          machine_id: machineId,
          client_name: normalizeLabel_(request.client_name || "Event Computer", 80),
          status: status,
          timestamp: normalizeTimestamp_(request.timestamp, Date.now()),
          updated_at: normalizeTimestamp_(request.updated_at, request.timestamp || Date.now()),
          block_duration: blockDuration,
        };
      } catch (error) {
        return null;
      }
    })
    .filter(function(item) { return item !== null; })
    .sort(function(a, b) { return b.timestamp - a.timestamp; })
    .slice(0, ASTA_AUTH.MAX_REQUESTS);
}


function updateRequest_(machineId, patch, props) {
  const current = getRequest_(machineId, props) || {
    machine_id: machineId,
    client_name: "Event Computer",
    timestamp: Date.now(),
  };
  const updated = Object.assign({}, current, patch);
  props.setProperty(requestKey_(machineId), JSON.stringify(updated));
  return updated;
}


function getRequest_(machineId, props) {
  const raw = props.getProperty(requestKey_(machineId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}


function trimOldRequests_(props) {
  const all = props.getProperties();
  const requestKeys = Object.keys(all)
    .filter(function(key) { return key.indexOf(ASTA_AUTH.REQUEST_PREFIX) === 0; })
    .map(function(key) {
      try {
        const request = JSON.parse(all[key]);
        return { key: key, machine_id: request.machine_id, timestamp: Number(request.timestamp || 0) };
      } catch (error) {
        return { key: key, machine_id: key.slice(ASTA_AUTH.REQUEST_PREFIX.length), timestamp: 0 };
      }
    })
    .sort(function(a, b) { return b.timestamp - a.timestamp; });

  requestKeys.slice(ASTA_AUTH.MAX_REQUESTS).forEach(function(request) {
    props.deleteProperty(request.key);
    props.deleteProperty(statusKey_(request.machine_id));
  });
}


function getPasswordPayload_(props) {
  let passwordHash = String(props.getProperty(ASTA_AUTH.PASSWORD_HASH_KEY) || "").toLowerCase();
  let version = parseInt(props.getProperty(ASTA_AUTH.PASSWORD_VERSION_KEY) || "0", 10);

  if (!isSha256Hex_(passwordHash)) {
    const legacyPassword = String(props.getProperty(ASTA_AUTH.LEGACY_PASSWORD_KEY) || "");
    if (!legacyPassword) {
      throw new Error("Global password is not configured");
    }
    passwordHash = sha256Hex_(legacyPassword);
    version = version > 0 ? version : Date.now();
    props.setProperty(ASTA_AUTH.PASSWORD_HASH_KEY, passwordHash);
    props.setProperty(ASTA_AUTH.PASSWORD_VERSION_KEY, String(version));
    props.deleteProperty(ASTA_AUTH.LEGACY_PASSWORD_KEY);
  }

  return {
    global_password_hash: passwordHash,
    password_version: version,
  };
}


function getPasswordVersionPayload_(props) {
  const payload = getPasswordPayload_(props);
  return {
    password_version: payload.password_version,
    password_available: true,
  };
}


function areRequestNotificationsEnabled_(props) {
  return String(props.getProperty(ASTA_AUTH.NOTIFICATIONS_KEY) || "true").toLowerCase() !== "false";
}


function getAllAuthorizedEmails_(props) {
  return [ASTA_AUTH.SUPER_ADMIN_EMAIL.toLowerCase()].concat(getAdditionalAdminEmails_(props));
}


function getAdditionalAdminEmails_(props) {
  const raw = String(props.getProperty(ASTA_AUTH.ADMIN_EMAILS_KEY) || "");
  const unique = {};
  raw.split(",").forEach(function(value) {
    const email = String(value || "").trim().toLowerCase();
    if (email && email !== ASTA_AUTH.SUPER_ADMIN_EMAIL.toLowerCase() && isEmail_(email)) {
      unique[email] = true;
    }
  });
  return Object.keys(unique).sort();
}


function getAccessTokenForEmail_(email, props) {
  const normalizedEmail = normalizeEmail_(email);
  const tokenKey = normalizedEmail === ASTA_AUTH.SUPER_ADMIN_EMAIL.toLowerCase()
    ? ASTA_AUTH.SUPER_TOKEN_KEY
    : adminTokenKey_(normalizedEmail);
  let token = String(props.getProperty(tokenKey) || "");
  if (!token) {
    token = createSecureToken_();
    props.setProperty(tokenKey, token);
  }
  return token;
}


function requireAuthorizedActor_(accessToken, props) {
  const token = String(accessToken || "");
  if (!token) throw new Error("Access link required");

  const ownerEmail = ASTA_AUTH.SUPER_ADMIN_EMAIL.toLowerCase();
  if (safeTokenEquals_(token, getAccessTokenForEmail_(ownerEmail, props))) {
    return { role: "superadmin", email: ownerEmail };
  }

  const admins = getAdditionalAdminEmails_(props);
  for (let index = 0; index < admins.length; index += 1) {
    const email = admins[index];
    if (safeTokenEquals_(token, getAccessTokenForEmail_(email, props))) {
      return { role: "admin", email: email };
    }
  }

  throw new Error("Access link is invalid or expired");
}


function requireSuperAdmin_(accessToken, props) {
  const actor = requireAuthorizedActor_(accessToken, props);
  if (actor.role !== "superadmin") {
    throw new Error("Super Admin access required");
  }
  return actor;
}


function recordAudit_(props, actor, action, target) {
  const events = getAuditLog_(props);
  events.unshift({
    timestamp: Date.now(),
    actor: actor.email,
    role: actor.role,
    action: action,
    target: String(target || ""),
  });
  props.setProperty(ASTA_AUTH.AUDIT_LOG_KEY, JSON.stringify(events.slice(0, ASTA_AUTH.MAX_AUDIT_EVENTS)));
}


function getAuditLog_(props) {
  try {
    const parsed = JSON.parse(props.getProperty(ASTA_AUTH.AUDIT_LOG_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, ASTA_AUTH.MAX_AUDIT_EVENTS) : [];
  } catch (error) {
    return [];
  }
}


function renderAdminWebApp_() {
  return HtmlService.createHtmlOutputFromFile("AdminDashboard")
    .setTitle("Asta Studio Admin")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover");
}


function parseRequestBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error("Invalid JSON request");
  }
}


function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}


function normalizeMachineId_(value) {
  const machineId = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{3,80}$/.test(machineId)) {
    throw new Error("Invalid Machine ID");
  }
  return machineId;
}


function normalizeEmail_(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!isEmail_(email)) throw new Error("Invalid Admin email");
  return email;
}


function isEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}


function normalizeLabel_(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}


function normalizeTimestamp_(value, fallback) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return Number(fallback || Date.now());
  return timestamp < 100000000000 ? timestamp * 1000 : timestamp;
}


function normalizeBlockDuration_(value) {
  const duration = parseInt(value || "900", 10);
  return [900, 3600, 86400].indexOf(duration) >= 0 ? duration : 900;
}


function normalizeDashboardStatus_(rawStatus) {
  const status = String(rawStatus || "PENDING").toUpperCase();
  if (status.indexOf("BLOCKED:") === 0 || status === "BLOCKED") return "BLOCKED";
  if (status === "APPROVED" || status === "CONSUMED" || status === "CONFIRMED") return "CONFIRMED";
  return "PENDING";
}


function requestKey_(machineId) {
  return `${ASTA_AUTH.REQUEST_PREFIX}${machineId}`;
}


function statusKey_(machineId) {
  return `${ASTA_AUTH.STATUS_PREFIX}${machineId}`;
}


function adminTokenKey_(email) {
  return `${ASTA_AUTH.ADMIN_TOKEN_PREFIX}${sha256Hex_(email).slice(0, 24)}`;
}


function createSecureToken_() {
  const seed = `${Utilities.getUuid()}|${Utilities.getUuid()}|${Date.now()}|${Math.random()}`;
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed))
    .replace(/=+$/g, "");
}


function safeTokenEquals_(left, right) {
  const leftHash = sha256Hex_(String(left || ""));
  const rightHash = sha256Hex_(String(right || ""));
  let difference = leftHash.length ^ rightHash.length;
  for (let index = 0; index < Math.max(leftHash.length, rightHash.length); index += 1) {
    difference |= (leftHash.charCodeAt(index) || 0) ^ (rightHash.charCodeAt(index) || 0);
  }
  return difference === 0;
}


function sha256Hex_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ""))
    .map(function(byte) { return (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, "0"); })
    .join("");
}


function isSha256Hex_(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ""));
}


function escapeEmailHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


function formatEmailTimestamp_(timestamp) {
  return Utilities.formatDate(new Date(timestamp), Session.getScriptTimeZone() || "Asia/Bangkok", "dd MMM yyyy, HH:mm");
}


function errorMessage_(error) {
  return error && error.message ? String(error.message) : String(error || "Unknown error");
}
