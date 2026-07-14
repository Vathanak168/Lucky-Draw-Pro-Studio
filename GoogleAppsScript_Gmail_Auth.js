/**
 * ============================================================================
 * LUCKY DRAW PRO STUDIO (v5.0.0) - GMAIL REMOTE UNLOCK GATEKEEPER WEBHOOK
 * ============================================================================
 * 
 * របៀបដំឡើង (Setup Instructions - ត្រឹមតែ ២ នាទី)៖
 * ១. ចូលទៅកាន់ https://script.google.com ដោយប្រើគណនី Gmail ពិតរបស់អ្នក។
 * ២. ចុចប៊ូតុង "New project" -> លុបកូដចាស់ចោល -> Copy កូដខាងក្រោមនេះទាំងអស់ Paste ចូល។
 * ៣. កែប្រែអក្សរ "your-real-email@gmail.com" ខាងក្រោម ដាក់ជាអ៊ីមែលពិតរបស់អ្នក។
 * ៤. ចុចប៊ូតុងពណ៌ខៀវ "Deploy" (ខាងលើស្តាំ) -> ជ្រើសរើស "New deployment":
 *    - Select type: "Web app"
 *    - Description: "Lucky Draw Auth Webhook"
 *    - Execute as: "Me (your-real-email@gmail.com)"
 *    - Who has access: "Anyone" (ដើម្បីឲ្យ Laptop លើឆាកអាចភ្ជាប់មកបាន)
 * ៥. ចុច "Deploy" និង "Authorize access" -> Copy យក URL (https://script.google.com/macros/s/.../exec)
 *    យកមកដាក់ក្នុងឯកសារ src/backend/config.py ត្រង់ GOOGLE_APPS_SCRIPT_URL ជាការស្រេច!
 */

// ⚠️ អ៊ីមែលរបស់អ្នក (បានបញ្ចូលរួចរាល់)៖
const ADMIN_GMAIL_ADDRESS = "chhaysereyvathanak@gmail.com"; // អ៊ីមែលពិតរបស់អ្នកសម្រាប់ទទួលសារ Confirm
const ADMIN_SECRET_TOKEN = "LDP_SECRET_PASS_2026"; // Secret Token ការពារសុវត្ថិភាព Link Approve
const SUPER_ADMIN_SECRET_TOKEN = "LDP_SUPER_ADMIN_2026_PRO"; // Token សម្រាប់ Super Admin (មានសិទ្ធិប្តូរ Password គ្រប់ Laptop)

/**
 * មុខងារទាញយក Email Admin ទាំងអស់ (បញ្ចូលបន្ថែមដោយ Super Admin ក្នុង iOS Portal)
 */
function getAllAuthorizedEmails(props) {
  let list = [ADMIN_GMAIL_ADDRESS.trim().toLowerCase()];
  try {
    if (props) {
      const stored = props.getProperty("AUTHORIZED_ADMIN_EMAILS");
      if (stored) {
        const extra = stored.split(",").map(s => s.trim().toLowerCase()).filter(s => s.length > 0 && s.includes("@"));
        list = Array.from(new Set([...list, ...extra]));
      }
    }
  } catch (err) {}
  return list;
}

/**
 * ដោះស្រាយ POST Requests ពីកម្មវិធី Lucky Draw (ពេលបុគ្គលិកចុច 🚀 REQUEST REMOTE UNLOCK)
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    const machineId = data.machine_id;
    const clientName = data.client_name || "Stage Crew Laptop";
    const timestamp = data.timestamp || Date.now();

    const props = PropertiesService.getScriptProperties();

    if (action === "request") {
      // ១. កត់ត្រាសំណើចូល Properties Store និង Reset status ទៅជា PENDING
      props.setProperty(`REQ_${machineId}`, JSON.stringify({
        machine_id: machineId,
        client_name: clientName,
        status: "PENDING",
        timestamp: timestamp
      }));
      props.setProperty(`STATUS_${machineId}`, "PENDING");

      const scriptUrl = ScriptApp.getService().getUrl();
      const emailSubject = `🚨 [REMOTE UNLOCK] Stage Crew: ${clientName} (${machineId})`;

      const allAdmins = getAllAuthorizedEmails(props);
      const sentEmails = [];
      const failedEmails = [];

      allAdmins.forEach(email => {
        try {
          const cleanEmail = email.trim();
          if (!cleanEmail || !cleanEmail.includes("@")) return;
          const isSuper = (cleanEmail.toLowerCase() === ADMIN_GMAIL_ADDRESS.trim().toLowerCase());
          const targetRole = isSuper ? "superadmin" : "admin";
          const targetToken = isSuper ? SUPER_ADMIN_SECRET_TOKEN : ADMIN_SECRET_TOKEN;

          const approveUrl = `${scriptUrl}?action=approve&machine_id=${encodeURIComponent(machineId)}&token=${targetToken}&role=${targetRole}`;
          const rejectUrl = `${scriptUrl}?action=reject&machine_id=${encodeURIComponent(machineId)}&token=${targetToken}&role=${targetRole}`;
          const block15Url = `${scriptUrl}?action=block&duration=900&machine_id=${encodeURIComponent(machineId)}&token=${targetToken}&role=${targetRole}`;
          const portalUrl = `${scriptUrl}?action=portal&machine_id=${encodeURIComponent(machineId)}&token=${targetToken}&role=${targetRole}`;

          const customEmailHtml = `
            <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-weight: 400; max-width: 480px; background-color: #0c0c0e; color: #d1d1d6; padding: 28px 24px; border-radius: 12px; border: 1px solid #222228; margin: 0 auto;">
              <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #222228; padding-bottom: 16px; margin-bottom: 20px;">
                <span style="font-size: 17px; color: #ffffff; letter-spacing: 0;">Asta Studio Gatekeeper</span>
                <span style="background-color: #18181f; color: ${isSuper ? '#00e5a3' : '#3ea6ff'}; border: 1px solid ${isSuper ? '#00e5a3' : '#3ea6ff'}; font-size: 11px; padding: 3px 10px; border-radius: 4px; text-transform: uppercase;">${isSuper ? 'Super Admin' : 'Admin'}</span>
              </div>
              
              <div style="font-size: 14px; color: #9e9ea6; margin-bottom: 16px;">
                Remote unlock request pending authorization.
              </div>
              
              <div style="background-color: #14141a; border-radius: 8px; padding: 16px; margin: 16px 0; border: 1px solid #222228;">
                <div style="font-size: 11px; color: #6e6e78; text-transform: uppercase; margin-bottom: 4px;">Client Name</div>
                <div style="font-size: 15px; color: #ffffff; margin-bottom: 12px;">${clientName}</div>
                <div style="font-size: 11px; color: #6e6e78; text-transform: uppercase; margin-bottom: 4px;">Machine ID</div>
                <div style="font-size: 14px; color: #ff9f0a; font-family: ui-monospace, monospace;">${machineId}</div>
              </div>

              <div style="margin: 24px 0 16px;">
                <a href="${portalUrl}" target="_blank" style="background-color: ${isSuper ? '#ff453a' : '#1f1f28'}; color: #ffffff; border: 1px solid ${isSuper ? '#ff453a' : '#3ea6ff'}; text-decoration: none; padding: 13px; border-radius: 8px; font-size: 14px; text-align: center; display: block;">
                  ${isSuper ? 'Open Super Portal' : 'Open Portal'}
                </a>
              </div>

              <div style="background-color: #14141a; border-radius: 8px; padding: 16px; margin-top: 20px; border: 1px solid #222228; text-align: center;">
                <div style="font-size: 11px; color: #6e6e78; text-transform: uppercase; margin-bottom: 12px;">Quick Actions</div>
                <a href="${approveUrl}" target="_blank" style="background-color: #2ed573; color: #000000; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 13px; display: inline-block; margin: 4px;">
                  Unlock
                </a>
                <a href="${rejectUrl}" target="_blank" style="background-color: #2f1b1e; color: #ff4757; border: 1px solid #ff4757; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 13px; display: inline-block; margin: 4px;">
                  Reject
                </a>
                <a href="${block15Url}" target="_blank" style="background-color: #2a2015; color: #ffa502; border: 1px solid #ffa502; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 13px; display: inline-block; margin: 4px;">
                  Lock 15m
                </a>
              </div>

              <div style="border-top: 1px solid #222228; margin-top: 24px; padding-top: 14px; font-size: 11px; color: #505058; text-align: center;">
                Asta Studio v5.0.0
              </div>
            </div>
          `;

          MailApp.sendEmail({
            to: cleanEmail,
            name: "Asta Studio Gatekeeper",
            subject: emailSubject,
            htmlBody: customEmailHtml
          });
          sentEmails.push(cleanEmail);
        } catch (mailErr) {
          failedEmails.push({ email: email, error: mailErr.toString() });
        }
      });

      return ContentService.createTextOutput(JSON.stringify({
        status: "SUCCESS",
        sent_to: sentEmails,
        failed_to: failedEmails,
        message: `Request emailed to ${sentEmails.length} authorized Admin Gmail(s)!`
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "sync_password") {
      return ContentService.createTextOutput(JSON.stringify({
        status: "OK",
        global_password: props.getProperty("GLOBAL_MASTER_PASSWORD") || "resolume2026",
        password_version: parseInt(props.getProperty("GLOBAL_PASSWORD_VERSION") || "0")
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "set_password") {
      if (data.token !== SUPER_ADMIN_SECRET_TOKEN) {
        return ContentService.createTextOutput(JSON.stringify({ status: "ERROR", message: "⛔ Unauthorized Access. Super Admin Token Required." })).setMimeType(ContentService.MimeType.JSON);
      }
      const newPassword = data.new_password;
      if (!newPassword) return ContentService.createTextOutput(JSON.stringify({ status: "ERROR", message: "Missing new_password" })).setMimeType(ContentService.MimeType.JSON);
      const newVersion = Date.now();
      props.setProperty("GLOBAL_MASTER_PASSWORD", newPassword);
      props.setProperty("GLOBAL_PASSWORD_VERSION", newVersion.toString());

      MailApp.sendEmail({
        to: ADMIN_GMAIL_ADDRESS,
        subject: `[SUPER ADMIN] Master Password Broadcasted (${newVersion})`,
        htmlBody: `<div style="background:#0c0c0e; color:#d1d1d6; padding:28px 24px; font-family:'Inter', -apple-system, sans-serif; font-weight:400; border:1px solid #222228; border-radius:12px; max-width:480px;">
          <div style="font-size:17px; color:#ffffff; margin-bottom:16px;">Global Master Password Broadcast</div>
          <div style="background:#14141a; padding:16px; margin:16px 0; border:1px solid #222228; border-radius:8px;">
            <div style="font-size:11px; color:#6e6e78; text-transform:uppercase; margin-bottom:4px;">Master Password</div>
            <div style="font-size:17px; color:#00e5a3; font-family:ui-monospace, monospace;">${newPassword}</div>
          </div>
          <div style="font-size:11px; color:#505058; text-align:center; margin-top:20px;">Asta Studio v5.0.0</div>
        </div>`
      });

      return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", version: newVersion, message: "New password broadcasted to all Wi-Fi connected laptops!" })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "ERROR", message: "Unknown POST action" })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "ERROR", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ដោះស្រាយ GET Requests (សម្រាប់ Laptop ធ្វើការ Polling ពិនិត្យមើល និងសម្រាប់ Admin ចុច Link ក្នុង Gmail)
 */
function doGet(e) {
  const action = e.parameter.action;
  const machineId = e.parameter.machine_id;
  const token = e.parameter.token;
  const props = PropertiesService.getScriptProperties();

  // ១. ករណី Admin/Super Admin ចុច Link "APPROVE"
  if (action === "approve") {
    if (token !== ADMIN_SECRET_TOKEN && token !== SUPER_ADMIN_SECRET_TOKEN) return ContentService.createTextOutput("Unauthorized Token");
    props.setProperty(`STATUS_${machineId}`, "APPROVED");
    return renderIOSPortal(e, props, "APPROVED", "Access Unlocked");
  }

  // ២. ករណី Admin/Super Admin ចុច Link "REJECT"
  if (action === "reject") {
    if (token !== ADMIN_SECRET_TOKEN && token !== SUPER_ADMIN_SECRET_TOKEN) return ContentService.createTextOutput("Unauthorized Token");
    props.setProperty(`STATUS_${machineId}`, "REJECTED");
    return renderIOSPortal(e, props, "REJECTED", "Access Revoked");
  }

  // ៣. ករណី Admin/Super Admin ចុច Link "BLOCK"
  if (action === "block") {
    if (token !== ADMIN_SECRET_TOKEN && token !== SUPER_ADMIN_SECRET_TOKEN) return ContentService.createTextOutput("Unauthorized Token");
    const duration = parseInt(e.parameter.duration || "900");
    props.setProperty(`STATUS_${machineId}`, `BLOCKED:${duration}`);
    return renderIOSPortal(e, props, `BLOCKED:${duration}`, `Blocked ${Math.round(duration/60)}m`);
  }

  // ៤. ករណី Admin/Super Admin ចុច Link "UNBLOCK"
  if (action === "unblock") {
    if (token !== ADMIN_SECRET_TOKEN && token !== SUPER_ADMIN_SECRET_TOKEN) return ContentService.createTextOutput("Unauthorized Token");
    props.deleteProperty(`STATUS_${machineId}`);
    return renderIOSPortal(e, props, "PENDING", "Block Cleared");
  }

  // ៥. ករណី Laptop លើឆាកធ្វើការ Polling ពិនិត្យមើល status (`GET ?action=check&machine_id=...`)
  if (action === "check" && machineId) {
    const status = props.getProperty(`STATUS_${machineId}`);
    const globalPassword = props.getProperty("GLOBAL_MASTER_PASSWORD") || "resolume2026";
    const passwordVersion = parseInt(props.getProperty("GLOBAL_PASSWORD_VERSION") || "0");
    if (status && status.toString().indexOf("BLOCKED:") === 0) {
      const parts = status.split(":");
      const duration = parseInt(parts[1] || "900");
      return ContentService.createTextOutput(JSON.stringify({
        approved: false,
        blocked: true,
        duration: duration,
        message: `🚨 BLOCKED BY ADMIN / SUPER ADMIN FOR ${Math.round(duration/60)} MINUTES FOR REPEATED REQUESTS!`,
        global_password: globalPassword,
        password_version: passwordVersion
      })).setMimeType(ContentService.MimeType.JSON);
    }
    if (status === "APPROVED") {
      props.setProperty(`STATUS_${machineId}`, "CONSUMED");
      return ContentService.createTextOutput(JSON.stringify({
        approved: true,
        message: "Remote access granted by Admin via Gmail!",
        global_password: globalPassword,
        password_version: passwordVersion
      })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({
        approved: false,
        message: status === "REJECTED" ? "Request denied by Admin." : "Awaiting Admin confirmation...",
        global_password: globalPassword,
        password_version: passwordVersion
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ៦. ករណី Laptop ស្នើសុំ Sync Password បិទបើកតាម Wi-Fi (`GET ?action=sync_password`)
  if (action === "sync_password") {
    return ContentService.createTextOutput(JSON.stringify({
      status: "OK",
      global_password: props.getProperty("GLOBAL_MASTER_PASSWORD") || "resolume2026",
      password_version: parseInt(props.getProperty("GLOBAL_PASSWORD_VERSION") || "0")
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ៧. ករណី Super Admin ចុចប្តូរ Password (`GET ?action=set_password&new_password=...`)
  if (action === "set_password") {
    if (token !== SUPER_ADMIN_SECRET_TOKEN) return ContentService.createTextOutput("⛔ Unauthorized Access. Super Admin Token Required.");
    const newPassword = e.parameter.new_password;
    if (!newPassword) return ContentService.createTextOutput("Please provide new_password parameter.");
    const newVersion = Date.now();
    props.setProperty("GLOBAL_MASTER_PASSWORD", newPassword);
    props.setProperty("GLOBAL_PASSWORD_VERSION", newVersion.toString());
    return renderIOSPortal(e, props, null, `Password Broadcasted (${newPassword})`);
  }

  // ៨. ករណី Super Admin ចុច Add Admin Gmail (`GET ?action=add_admin_email&new_email=...`)
  if (action === "add_admin_email") {
    if (token !== SUPER_ADMIN_SECRET_TOKEN) return ContentService.createTextOutput("⛔ Unauthorized Access. Super Admin Token Required.");
    const newEmail = (e.parameter.new_email || "").trim().toLowerCase();
    if (newEmail && newEmail.includes("@")) {
      const currentStr = props.getProperty("AUTHORIZED_ADMIN_EMAILS") || "";
      let list = currentStr ? currentStr.split(",").map(s => s.trim().toLowerCase()).filter(Boolean) : [];
      if (!list.includes(newEmail)) {
        list.push(newEmail);
        props.setProperty("AUTHORIZED_ADMIN_EMAILS", list.join(","));
      }
    }
    return renderIOSPortal(e, props, null, `Admin Added (${newEmail})`);
  }

  // ៩. ករណី Super Admin ចុច Remove Admin Gmail (`GET ?action=remove_admin_email&remove_email=...`)
  if (action === "remove_admin_email") {
    if (token !== SUPER_ADMIN_SECRET_TOKEN) return ContentService.createTextOutput("⛔ Unauthorized Access. Super Admin Token Required.");
    const removeEmail = (e.parameter.remove_email || "").trim().toLowerCase();
    if (removeEmail) {
      const currentStr = props.getProperty("AUTHORIZED_ADMIN_EMAILS") || "";
      let list = currentStr ? currentStr.split(",").map(s => s.trim().toLowerCase()).filter(Boolean) : [];
      list = list.filter(item => item !== removeEmail);
      props.setProperty("AUTHORIZED_ADMIN_EMAILS", list.join(","));
    }
    return renderIOSPortal(e, props, null, `Admin Removed (${removeEmail})`);
  }

  // ១០. ករណីបើកផ្ទាំង Unified iOS Portal ផ្ទាល់ (`GET ?action=portal`)
  if (action === "portal") {
    return renderIOSPortal(e, props, null, null);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: "OK", service: "LDP Gatekeeper Webhook v5.0 (With iOS Gateway Portal)" })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * ============================================================================
 * UNIFIED iOS CLEAN + PROFESSIONAL GATEWAY PORTAL RENDERER
 * ============================================================================
 * Desing Page តែមួយប៉ុន្តែពេលយកទៅឲ្យ Admin ប្រើប្រាស់គឺត្រូវកាត់មុខងារ Super admin ចេញ
 */
function renderIOSPortal(e, props, statusOverride, toastMessage) {
  const machineId = e.parameter.machine_id || "UNKNOWN_MACHINE";
  const token = e.parameter.token || "";
  const roleParam = e.parameter.role || "";
  
  if (token !== ADMIN_SECRET_TOKEN && token !== SUPER_ADMIN_SECRET_TOKEN) {
    return ContentService.createTextOutput("⛔ Unauthorized Access. Invalid Security Token.").setMimeType(ContentService.MimeType.TEXT);
  }

  // Check role: Super Admin features are strictly active ONLY when token exactly matches SUPER_ADMIN_SECRET_TOKEN.
  // When Admin opens this page with Admin token (LDP_SECRET_PASS_2026), isSuperAdmin is FALSE, stripping out all Super Admin capabilities!
  const isSuperAdmin = (token === SUPER_ADMIN_SECRET_TOKEN);

  const reqDataStr = props.getProperty(`REQ_${machineId}`);
  let clientName = "Stage Crew Laptop";
  let lastSeen = "Active Now";
  if (reqDataStr) {
    try {
      const parsed = JSON.parse(reqDataStr);
      if (parsed.client_name) clientName = parsed.client_name;
      if (parsed.timestamp) {
        const diff = Math.round((Date.now() - parsed.timestamp) / 60000);
        lastSeen = diff <= 1 ? "Just now" : `${diff} mins ago`;
      }
    } catch (err) {}
  }

  const rawStatus = statusOverride || props.getProperty(`STATUS_${machineId}`) || "PENDING";
  let statusBadgeHtml = `<span class="status-pill pending">PENDING</span>`;
  if (rawStatus === "APPROVED") {
    statusBadgeHtml = `<span class="status-pill approved">UNLOCKED</span>`;
  } else if (rawStatus === "REJECTED") {
    statusBadgeHtml = `<span class="status-pill rejected">LOCKED</span>`;
  } else if (rawStatus && rawStatus.toString().indexOf("BLOCKED:") === 0) {
    const dur = parseInt(rawStatus.split(":")[1] || "900");
    statusBadgeHtml = `<span class="status-pill blocked">BLOCKED (${Math.round(dur/60)}m)</span>`;
  }

  const currentGlobalPwd = props.getProperty("GLOBAL_MASTER_PASSWORD") || "resolume2026";
  const currentVersion = props.getProperty("GLOBAL_PASSWORD_VERSION") || "Default (v0)";
  const scriptUrl = ScriptApp.getService().getUrl();

  // Action links preserving current role context
  const baseParams = `?machine_id=${encodeURIComponent(machineId)}&token=${encodeURIComponent(token)}&role=${isSuperAdmin ? 'superadmin' : 'admin'}`;
  const approveUrl = `${scriptUrl}${baseParams}&action=approve`;
  const rejectUrl = `${scriptUrl}${baseParams}&action=reject`;
  const block15Url = `${scriptUrl}${baseParams}&action=block&duration=900`;
  const block60Url = `${scriptUrl}${baseParams}&action=block&duration=3600`;
  const unblockUrl = `${scriptUrl}${baseParams}&action=unblock`;

  // Super Admin section (Stripped out completely when Admin opens)
  let superAdminHtml = "";
  if (isSuperAdmin) {
    const allAuthorizedEmails = getAllAuthorizedEmails(props);
    let emailRowsHtml = allAuthorizedEmails.map((em, idx) => {
      const isOwner = (idx === 0);
      return `
        <div class="cell-row" style="padding: 14px 18px;">
          <span style="font-size: 14px; color: #fff;">${em} ${isOwner ? '<span class="pill-badge blue" style="margin-left:6px;">SUPER ADMIN</span>' : ''}</span>
          ${isOwner ? '<span style="font-size:12px; color:#636366;">Primary</span>' : `
            <a href="${scriptUrl}${baseParams}&action=remove_admin_email&remove_email=${encodeURIComponent(em)}" target="_top" style="color: var(--ios-red); text-decoration: none; font-size: 13px;">Remove</a>
          `}
        </div>
      `;
    }).join('');

    superAdminHtml = `
      <div class="group-header" style="color: #0a84ff;">System Wi-Fi Sync</div>
      <div class="ios-card super-admin-card">
        <div class="super-badge-header">
          <span style="font-size: 15px; color: #fff;">Universal Override</span>
          <span class="pill-badge blue">GLOBAL SYNC</span>
        </div>

        <div class="pwd-display-box">
          <div style="font-size: 11px; color: #8e8e93; text-transform: uppercase; margin-bottom: 4px;">Master Password</div>
          <div style="font-size: 17px; color: #00e5a3; font-family: ui-monospace, monospace;">${currentGlobalPwd}</div>
          <div style="font-size: 11px; color: #636366; margin-top: 4px;">Version: ${currentVersion}</div>
        </div>

        <form action="${scriptUrl}" method="GET" target="_top" style="margin-top: 16px;">
          <input type="hidden" name="action" value="set_password">
          <input type="hidden" name="machine_id" value="${machineId}">
          <input type="hidden" name="token" value="${token}">
          <input type="hidden" name="role" value="superadmin">
          
          <input type="text" name="new_password" class="input-ios" placeholder="Type new password..." required autocomplete="off">
          
          <button type="submit" class="btn-solid-blue">
            Broadcast Sync
          </button>
        </form>
      </div>

      <div class="group-header" style="color: #30d158; margin-top: 24px;">Multi-Admin Access</div>
      <div class="ios-card super-admin-card" style="border-color: rgba(48, 209, 88, 0.45);">
        <div class="super-badge-header">
          <span style="font-size: 15px; color: #fff;">Authorize Admin</span>
          <span class="pill-badge green" style="background: rgba(48,209,88,0.15); color: var(--ios-green); border: 1px solid var(--ios-green);">INSTANT ACCESS</span>
        </div>

        <div style="background: #18181f; border-radius: 12px; border: 1px solid var(--ios-divider); overflow: hidden; margin: 16px 0;">
          ${emailRowsHtml}
        </div>

        <form action="${scriptUrl}" method="GET" target="_top" style="margin-top: 14px;">
          <input type="hidden" name="action" value="add_admin_email">
          <input type="hidden" name="machine_id" value="${machineId}">
          <input type="hidden" name="token" value="${token}">
          <input type="hidden" name="role" value="superadmin">
          
          <input type="email" name="new_email" class="input-ios" placeholder="Type Admin Gmail..." required autocomplete="off">
          
          <button type="submit" class="btn-solid-green" style="background: var(--ios-green); color: #000; border: none; padding: 15px; border-radius: 12px; width: 100%; cursor: pointer; font-size: 15px;">
            Add Admin
          </button>
        </form>
      </div>
    `;
  }

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Asta Studio - Gateway Portal</title>
  <style>
    :root {
      --ios-bg: #0b0b0e;
      --ios-card: #16161b;
      --ios-card-hover: #22222a;
      --ios-divider: rgba(255, 255, 255, 0.07);
      --ios-blue: #0a84ff;
      --ios-green: #30d158;
      --ios-red: #ff453a;
      --ios-orange: #ff9f0a;
      --ios-text: #ffffff;
      --ios-subtext: #8e8e93;
    }
    * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
      font-weight: 400 !important;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    }
    body {
      margin: 0; padding: 0;
      background-color: var(--ios-bg);
      color: var(--ios-text);
      min-height: 100vh;
      padding-bottom: 60px;
    }
    .header-nav {
      position: sticky; top: 0; z-index: 100;
      background: rgba(22, 22, 27, 0.9);
      backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px);
      border-bottom: 1px solid var(--ios-divider);
      padding: 16px 20px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .header-title { font-size: 16px; letter-spacing: -0.3px; display: flex; align-items: center; }
    .role-badge {
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
      padding: 5px 12px; border-radius: 12px;
      background: ${isSuperAdmin ? '#ff453a' : '#1f1f28'};
      color: #fff; border: 1px solid ${isSuperAdmin ? '#ff453a' : '#3ea6ff'};
    }
    .container { max-width: 560px; margin: 24px auto; padding: 0 16px; }
    
    .toast-banner {
      background: #18281e; border: 1px solid var(--ios-green); color: #fff;
      padding: 14px 18px; border-radius: 12px; margin-bottom: 24px; font-size: 14px;
      display: flex; align-items: center; gap: 12px;
    }
    
    .group-header {
      font-size: 12px; color: var(--ios-subtext);
      text-transform: uppercase; letter-spacing: 0.5px;
      margin: 22px 0 8px 10px;
    }
    
    .ios-card {
      background-color: var(--ios-card);
      border-radius: 14px;
      border: 1px solid var(--ios-divider);
      overflow: hidden;
      margin-bottom: 16px;
    }
    .cell-row {
      padding: 15px 18px;
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid var(--ios-divider);
      font-size: 14px;
    }
    .cell-row:last-child { border-bottom: none; }
    .cell-label { color: var(--ios-subtext); }
    .cell-value { color: #fff; text-align: right; }
    .cell-value.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important; color: var(--ios-orange); font-size: 13px; }
    
    .status-pill {
      display: inline-block; padding: 4px 10px; border-radius: 8px; font-size: 11px;
    }
    .status-pill.approved { background: #15291b; color: var(--ios-green); border: 1px solid var(--ios-green); }
    .status-pill.rejected { background: #2f1b1e; color: var(--ios-red); border: 1px solid var(--ios-red); }
    .status-pill.blocked { background: #2a2015; color: var(--ios-orange); border: 1px solid var(--ios-orange); }
    .status-pill.pending { background: #22222a; color: #aaa; border: 1px solid #444; }

    .btn-cell {
      display: block; width: 100%; padding: 15px; text-align: center;
      font-size: 15px; text-decoration: none; border: none; cursor: pointer;
      background: transparent;
      border-bottom: 1px solid var(--ios-divider);
      transition: background 0.15s ease;
    }
    .btn-cell:last-child { border-bottom: none; }
    .btn-cell:active { background: var(--ios-card-hover); }
    .btn-green { color: var(--ios-green); }
    .btn-red { color: var(--ios-red); }
    .btn-orange { color: var(--ios-orange); }
    .btn-blue { color: var(--ios-blue); }

    .btn-solid-blue {
      display: block; width: 100%; padding: 15px; text-align: center; border: none;
      background: var(--ios-blue); color: #fff; font-size: 15px;
      text-decoration: none; border-radius: 12px; cursor: pointer;
    }
    .btn-solid-blue:active { background: #0070e0; }

    .super-admin-card {
      background: #16161b;
      border: 1px solid #283858;
      padding: 20px;
    }
    .super-badge-header { display: flex; justify-content: space-between; align-items: center; }
    .pill-badge { font-size: 10px; padding: 3px 8px; border-radius: 4px; }
    .pill-badge.blue { background: #13243a; color: var(--ios-blue); border: 1px solid var(--ios-blue); }
    
    .pwd-display-box {
      background: #1e1e24; border-radius: 10px; padding: 14px; margin: 14px 0;
      border-left: 3px solid var(--ios-green);
    }
    .input-ios {
      width: 100%; padding: 14px; border-radius: 10px; border: 1px solid var(--ios-divider);
      background: #202028; color: #fff; font-size: 15px; margin: 12px 0 16px; outline: none;
    }
    .input-ios:focus { border-color: var(--ios-blue); }

    .footer-note {
      text-align: center; color: #636366; font-size: 12px; margin-top: 36px;
    }
  </style>
</head>
<body>
  <div class="header-nav">
    <div class="header-title">
      <span>Asta Studio</span>
    </div>
    <div class="role-badge">${isSuperAdmin ? 'Super Admin' : 'Admin'}</div>
  </div>

  <div class="container">
    ${toastMessage ? `
      <div class="toast-banner">
        <span>${toastMessage}</span>
      </div>
    ` : ''}

    <div class="group-header">System Profile</div>
    <div class="ios-card">
      <div class="cell-row">
        <span class="cell-label">Operator</span>
        <span class="cell-value">${clientName}</span>
      </div>
      <div class="cell-row">
        <span class="cell-label">Machine ID</span>
        <span class="cell-value mono">${machineId}</span>
      </div>
      <div class="cell-row">
        <span class="cell-label">Last Seen</span>
        <span class="cell-value">${lastSeen}</span>
      </div>
      <div class="cell-row">
        <span class="cell-label">Status</span>
        <span class="cell-value">${statusBadgeHtml}</span>
      </div>
    </div>

    <div class="group-header">Access Controls</div>
    <div class="ios-card">
      <a href="${approveUrl}" target="_top" class="btn-cell btn-green">Unlock Access</a>
      <a href="${rejectUrl}" target="_top" class="btn-cell btn-red">Revoke Access</a>
      <a href="${unblockUrl}" target="_top" class="btn-cell btn-blue">Clear Block</a>
    </div>

    <div class="group-header">Security Lockdown</div>
    <div class="ios-card">
      <a href="${block15Url}" target="_top" class="btn-cell btn-orange">Lock 15m</a>
      <a href="${block60Url}" target="_top" class="btn-cell btn-red">Lock 1h</a>
    </div>

    ${superAdminHtml}

    <div class="footer-note">
      Asta Studio v5.0.0
    </div>
  </div>
</body>
</html>
  `;

  return HtmlService.createHtmlOutput(htmlContent)
    .setTitle("Asta Studio - Gateway Portal")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
