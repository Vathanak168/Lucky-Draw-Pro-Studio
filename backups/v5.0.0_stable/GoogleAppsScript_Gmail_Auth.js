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
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif; max-width: 520px; background-color: #000000; color: #ffffff; padding: 32px 24px; border-radius: 20px; border: 1px solid #2c2c2e; margin: 0 auto;">
              <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #2c2c2e; padding-bottom: 18px; margin-bottom: 24px;">
                <div>
                  <h2 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">⚙️ LDP Studio</h2>
                  <p style="color: #8e8e93; font-size: 13px; margin: 4px 0 0;">Access Control Center</p>
                </div>
                <span style="background-color: #1c1c1e; color: ${isSuper ? '#00e5a3' : '#0a84ff'}; border: 1px solid ${isSuper ? '#00e5a3' : '#0a84ff'}; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 12px; text-transform: uppercase;">${isSuper ? '👑 Super Admin' : '🛡️ Admin Portal'}</span>
              </div>
              
              <p style="color: #d1d1d6; font-size: 15px; line-height: 1.5; margin-bottom: 20px;">
                បុគ្គលិកកំពុងស្នើសុំបើកសោរកម្មវិធី <b>Lucky Draw Pro Studio (v5.0.0)</b> លើកុំព្យូទ័រ៖
              </p>
              
              <div style="background-color: #1c1c1e; border-radius: 16px; padding: 18px; margin: 20px 0; border: 1px solid #2c2c2e;">
                <div style="font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; margin-bottom: 4px;">ឈ្មោះបុគ្គលិក / ទីតាំង</div>
                <div style="font-size: 17px; font-weight: 700; color: #ffffff; margin-bottom: 14px;">👤 ${clientName}</div>
                <div style="font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; margin-bottom: 4px;">Hardware Machine Binding ID</div>
                <div style="font-size: 15px; font-family: ui-monospace, monospace; font-weight: 700; color: #ff9f0a;">🖥️ ${machineId}</div>
              </div>

              <div style="margin: 28px 0 16px;">
                <div style="font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px;">🌐 iOS Unified Management Screen</div>
                <a href="${portalUrl}" target="_blank" style="background: ${isSuper ? 'linear-gradient(135deg, #ff9f0a, #ff453a)' : '#1c1c1e'}; color: ${isSuper ? '#ffffff' : '#30d158'}; border: ${isSuper ? 'none' : '1.5px solid #30d158'}; font-weight: 700; text-decoration: none; padding: 16px; border-radius: 14px; font-size: 15px; text-align: center; display: block; box-shadow: ${isSuper ? '0 6px 20px rgba(255,69,58,0.25)' : 'none'};">
                  ${isSuper ? '👑 OPEN iOS CONTROL PORTAL (SUPER ADMIN MODE)' : '📱 OPEN iOS CONTROL PORTAL (ADMIN MODE)'}
                </a>
              </div>

              <div style="background-color: #1c1c1e; border-radius: 16px; padding: 18px; margin-top: 24px; border: 1px solid #2c2c2e; text-align: center;">
                <div style="font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; margin-bottom: 14px;">⚡ Quick Instant Actions (${isSuper ? 'Super Admin' : 'Admin'})</div>
                <a href="${approveUrl}" target="_blank" style="background-color: #30d158; color: #000000; font-weight: 700; text-decoration: none; padding: 12px 20px; border-radius: 12px; font-size: 14px; display: inline-block; margin: 4px;">
                  🔓 Grant Unlock
                </a>
                <a href="${rejectUrl}" target="_blank" style="background-color: #2c2c2e; color: #ff453a; font-weight: 600; text-decoration: none; padding: 12px 20px; border-radius: 12px; font-size: 14px; display: inline-block; margin: 4px;">
                  ❌ Reject
                </a>
                <a href="${block15Url}" target="_blank" style="background-color: #2c2c2e; color: #ff9f0a; font-weight: 600; text-decoration: none; padding: 12px 20px; border-radius: 12px; font-size: 14px; display: inline-block; margin: 4px;">
                  🚫 Block 15m
                </a>
              </div>

              <div style="border-top: 1px solid #2c2c2e; margin-top: 28px; padding-top: 16px; font-size: 11px; color: #636366; text-align: center; line-height: 1.5;">
                Lucky Draw Pro Studio v5.0.0 • Apple iOS Design System<br>
                Note: ${isSuper ? 'Super Admin Mode — Worldwide Master Password & Multi-Admin enabled.' : 'Admin Mode automatically conceals all Super Admin capabilities.'}
              </div>
            </div>
          `;

          MailApp.sendEmail({
            to: cleanEmail,
            name: "LDP Studio Gatekeeper",
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
        subject: `🔐 [SUPER ADMIN] Master Password Changed Remotely (${newVersion})`,
        htmlBody: `<div style="background:#161616; color:#fff; padding:30px; font-family:sans-serif; border:2px solid #00e5a3; border-radius:10px;">
          <h2 style="color:#00e5a3;">🌐 SUPER ADMIN GLOBAL PASSWORD SYNC</h2>
          <p>You have successfully updated the global master password for all Lucky Draw Pro Studio laptops.</p>
          <div style="background:#222; padding:15px; margin:20px 0; border-left:4px solid #00e5a3; font-family:monospace; font-size:16px;">
            New Master Password: <b>${newPassword}</b>
          </div>
          <p style="color:#aaa; font-size:13px;">Every laptop connected to Wi-Fi will sync and apply this password immediately. Laptops currently offline will sync the moment they connect to Wi-Fi.</p>
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
    return renderIOSPortal(e, props, "APPROVED", "✅ Access Approved & Laptop Unlocked!");
  }

  // ២. ករណី Admin/Super Admin ចុច Link "REJECT"
  if (action === "reject") {
    if (token !== ADMIN_SECRET_TOKEN && token !== SUPER_ADMIN_SECRET_TOKEN) return ContentService.createTextOutput("Unauthorized Token");
    props.setProperty(`STATUS_${machineId}`, "REJECTED");
    return renderIOSPortal(e, props, "REJECTED", "❌ Access Denied & Console Locked.");
  }

  // ៣. ករណី Admin/Super Admin ចុច Link "BLOCK"
  if (action === "block") {
    if (token !== ADMIN_SECRET_TOKEN && token !== SUPER_ADMIN_SECRET_TOKEN) return ContentService.createTextOutput("Unauthorized Token");
    const duration = parseInt(e.parameter.duration || "900");
    props.setProperty(`STATUS_${machineId}`, `BLOCKED:${duration}`);
    return renderIOSPortal(e, props, `BLOCKED:${duration}`, `🚫 Application Blocked for ${Math.round(duration/60)} Minutes.`);
  }

  // ៤. ករណី Admin/Super Admin ចុច Link "UNBLOCK"
  if (action === "unblock") {
    if (token !== ADMIN_SECRET_TOKEN && token !== SUPER_ADMIN_SECRET_TOKEN) return ContentService.createTextOutput("Unauthorized Token");
    props.deleteProperty(`STATUS_${machineId}`);
    return renderIOSPortal(e, props, "PENDING", "⚡ Block Penalties Cleared & Reset.");
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
    return renderIOSPortal(e, props, null, `🚀 Universal Master Password Broadcasted to [ ${newPassword} ] Worldwide!`);
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
    return renderIOSPortal(e, props, null, `✅ Admin Gmail [ ${newEmail} ] added successfully! They will now receive instant unlock requests.`);
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
    return renderIOSPortal(e, props, null, `🗑️ Admin Gmail [ ${removeEmail} ] removed successfully.`);
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
  let statusBadgeHtml = `<span class="status-pill pending">🟡 PENDING APPROVAL</span>`;
  if (rawStatus === "APPROVED") {
    statusBadgeHtml = `<span class="status-pill approved">🟢 UNLOCKED & APPROVED</span>`;
  } else if (rawStatus === "REJECTED") {
    statusBadgeHtml = `<span class="status-pill rejected">🔴 REJECTED & LOCKED</span>`;
  } else if (rawStatus && rawStatus.toString().indexOf("BLOCKED:") === 0) {
    const dur = parseInt(rawStatus.split(":")[1] || "900");
    statusBadgeHtml = `<span class="status-pill blocked">🚫 BLOCKED (${Math.round(dur/60)} MINS)</span>`;
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
          <span style="font-size: 14px; font-weight: 600; color: #fff;">📧 ${em} ${isOwner ? '<span class="pill-badge blue" style="margin-left:6px;">SUPER ADMIN</span>' : ''}</span>
          ${isOwner ? '<span style="font-size:12px; color:#636366;">Primary</span>' : `
            <a href="${scriptUrl}${baseParams}&action=remove_admin_email&remove_email=${encodeURIComponent(em)}" target="_top" style="color: var(--ios-red); text-decoration: none; font-size: 13px; font-weight: 700;">🗑️ Remove</a>
          `}
        </div>
      `;
    }).join('');

    superAdminHtml = `
      <div class="group-header" style="color: #0a84ff;">👑 Super Admin Global Security Portal</div>
      <div class="ios-card super-admin-card">
        <div class="super-badge-header">
          <span style="font-size: 16px; font-weight: 700; color: #fff;">🌐 Wi-Fi Universal Password Override</span>
          <span class="pill-badge blue">WORLDWIDE BROADCAST</span>
        </div>
        
        <p style="color: #a0a0a5; font-size: 13px; line-height: 1.5; margin: 12px 0 16px;">
          Changing this password will immediately sync over Wi-Fi across all event venues globally. Laptops currently offline will sync instantly upon connection.
        </p>

        <div class="pwd-display-box">
          <div style="font-size: 11px; color: #8e8e93; font-weight: 600; text-transform: uppercase; margin-bottom: 4px;">Active Master Password:</div>
          <div style="font-size: 18px; font-weight: 700; color: #00e5a3; font-family: ui-monospace, monospace;">🔐 ${currentGlobalPwd}</div>
          <div style="font-size: 11px; color: #636366; margin-top: 4px;">Sync Version Stamp: ${currentVersion}</div>
        </div>

        <form action="${scriptUrl}" method="GET" target="_top" style="margin-top: 20px;">
          <input type="hidden" name="action" value="set_password">
          <input type="hidden" name="machine_id" value="${machineId}">
          <input type="hidden" name="token" value="${token}">
          <input type="hidden" name="role" value="superadmin">
          
          <input type="text" name="new_password" class="input-ios" placeholder="Type new universal password (e.g. resolume2027)..." required autocomplete="off">
          
          <button type="submit" class="btn-solid-blue">
            🚀 BROADCAST TO ALL LAPTOPS NOW
          </button>
        </form>
      </div>

      <div class="group-header" style="color: #30d158; margin-top: 28px;">👥 Instant Multi-Admin Gmail Authorization</div>
      <div class="ios-card super-admin-card" style="border-color: rgba(48, 209, 88, 0.45); box-shadow: 0 8px 32px rgba(48, 209, 88, 0.1);">
        <div class="super-badge-header">
          <span style="font-size: 16px; font-weight: 700; color: #fff;">⚡ Add Admin Gmail (Zero-Setup Access)</span>
          <span class="pill-badge green" style="background: rgba(48,209,88,0.2); color: var(--ios-green); border: 1px solid var(--ios-green);">1-CLICK PROCESS</span>
        </div>
        
        <p style="color: #a0a0a5; font-size: 13px; line-height: 1.5; margin: 12px 0 16px;">
          Added Admins immediately receive unlock request emails in their Gmail (<code>ដំណើរការតែម្តង</code>). When an Admin opens the iOS Portal, Super Admin powers are automatically hidden from them!
        </p>

        <div style="background: #1c1c1e; border-radius: 12px; border: 1px solid var(--ios-divider); overflow: hidden; margin-bottom: 18px;">
          ${emailRowsHtml}
        </div>

        <form action="${scriptUrl}" method="GET" target="_top" style="margin-top: 14px;">
          <input type="hidden" name="action" value="add_admin_email">
          <input type="hidden" name="machine_id" value="${machineId}">
          <input type="hidden" name="token" value="${token}">
          <input type="hidden" name="role" value="superadmin">
          
          <input type="email" name="new_email" class="input-ios" placeholder="Type Admin Gmail (e.g. stage.admin2026@gmail.com)..." required autocomplete="off">
          
          <button type="submit" class="btn-solid-green" style="background: var(--ios-green); color: #000; font-weight: 700; border: none; padding: 16px; border-radius: 14px; width: 100%; cursor: pointer; font-size: 16px; box-shadow: 0 4px 16px rgba(48,209,88,0.3);">
            ➕ AUTHORIZE ADMIN GMAIL INSTANTLY
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
  <title>LDP Studio — iOS Gateway Portal</title>
  <style>
    :root {
      --ios-bg: #000000;
      --ios-card: #1c1c1e;
      --ios-card-hover: #2c2c2e;
      --ios-divider: rgba(255, 255, 255, 0.08);
      --ios-blue: #0a84ff;
      --ios-green: #30d158;
      --ios-red: #ff453a;
      --ios-orange: #ff9f0a;
      --ios-text: #ffffff;
      --ios-subtext: #8e8e93;
    }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body {
      margin: 0; padding: 0;
      background-color: var(--ios-bg);
      color: var(--ios-text);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      padding-bottom: 60px;
    }
    .header-nav {
      position: sticky; top: 0; z-index: 100;
      background: rgba(28, 28, 30, 0.85);
      backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px);
      border-bottom: 0.5px solid var(--ios-divider);
      padding: 16px 20px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .header-title { font-size: 18px; font-weight: 700; letter-spacing: -0.4px; display: flex; align-items: center; gap: 8px; }
    .role-badge {
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
      padding: 5px 12px; border-radius: 20px;
      background: ${isSuperAdmin ? 'linear-gradient(135deg, #ff9f0a, #ff453a)' : '#2c2c2e'};
      color: #fff;
    }
    .container { max-width: 580px; margin: 24px auto; padding: 0 16px; }
    
    .toast-banner {
      background: rgba(48, 209, 88, 0.15); border: 1px solid var(--ios-green); color: #fff;
      padding: 16px 18px; border-radius: 16px; margin-bottom: 24px; font-size: 14px; font-weight: 600;
      display: flex; align-items: center; gap: 12px;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 24px rgba(48, 209, 88, 0.15);
    }
    
    .group-header {
      font-size: 13px; font-weight: 600; color: var(--ios-subtext);
      text-transform: uppercase; letter-spacing: 0.6px;
      margin: 24px 0 8px 14px;
    }
    
    .ios-card {
      background-color: var(--ios-card);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.5);
      margin-bottom: 16px;
    }
    .cell-row {
      padding: 16px 18px;
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 0.5px solid var(--ios-divider);
      font-size: 15px;
    }
    .cell-row:last-child { border-bottom: none; }
    .cell-label { color: var(--ios-subtext); }
    .cell-value { font-weight: 600; color: #fff; text-align: right; }
    .cell-value.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--ios-orange); font-size: 14px; }
    
    .status-pill {
      display: inline-block; padding: 5px 12px; border-radius: 12px; font-size: 12px; font-weight: 700;
    }
    .status-pill.approved { background: rgba(48,209,88,0.2); color: var(--ios-green); border: 1px solid var(--ios-green); }
    .status-pill.rejected { background: rgba(255,69,58,0.2); color: var(--ios-red); border: 1px solid var(--ios-red); }
    .status-pill.blocked { background: rgba(255,159,10,0.2); color: var(--ios-orange); border: 1px solid var(--ios-orange); }
    .status-pill.pending { background: #2c2c2e; color: #aaa; }

    .btn-cell {
      display: block; width: 100%; padding: 16px; text-align: center;
      font-size: 16px; font-weight: 600; text-decoration: none; border: none; cursor: pointer;
      transition: background 0.15s ease, transform 0.1s ease;
      background: transparent;
      border-bottom: 0.5px solid var(--ios-divider);
    }
    .btn-cell:last-child { border-bottom: none; }
    .btn-cell:active { transform: scale(0.985); background: var(--ios-card-hover); }
    .btn-green { color: var(--ios-green); }
    .btn-red { color: var(--ios-red); }
    .btn-orange { color: var(--ios-orange); }
    .btn-blue { color: var(--ios-blue); }

    .btn-solid-blue {
      display: block; width: 100%; padding: 16px; text-align: center; border: none;
      background: var(--ios-blue); color: #fff; font-weight: 700; font-size: 16px;
      text-decoration: none; border-radius: 14px; cursor: pointer;
      box-shadow: 0 4px 16px rgba(10,132,255,0.4); transition: transform 0.1s ease;
    }
    .btn-solid-blue:active { transform: scale(0.985); }

    .super-admin-card {
      background: linear-gradient(145deg, #1c1c1e, #131315);
      border: 1.5px solid rgba(10, 132, 255, 0.45);
      padding: 22px;
      box-shadow: 0 8px 32px rgba(10, 132, 255, 0.12);
    }
    .super-badge-header { display: flex; justify-content: space-between; align-items: center; }
    .pill-badge { font-size: 10px; font-weight: 800; padding: 4px 8px; border-radius: 6px; }
    .pill-badge.blue { background: rgba(10, 132, 255, 0.2); color: var(--ios-blue); border: 1px solid var(--ios-blue); }
    
    .pwd-display-box {
      background: #28282b; border-radius: 12px; padding: 14px; margin: 14px 0;
      border-left: 4px solid var(--ios-green);
    }
    .input-ios {
      width: 100%; padding: 15px 16px; border-radius: 12px; border: 1px solid var(--ios-divider);
      background: #2c2c2e; color: #fff; font-size: 16px; margin: 12px 0 16px; outline: none;
      font-family: inherit;
    }
    .input-ios:focus { border-color: var(--ios-blue); box-shadow: 0 0 0 3px rgba(10,132,255,0.25); }

    .footer-note {
      text-align: center; color: #636366; font-size: 12px; margin-top: 36px; line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="header-nav">
    <div class="header-title">
      <span>⚙️ LDP Studio</span>
    </div>
    <div class="role-badge">${isSuperAdmin ? '👑 Super Admin' : '🛡️ Admin Mode'}</div>
  </div>

  <div class="container">
    ${toastMessage ? `
      <div class="toast-banner">
        <span style="font-size: 20px;">ℹ️</span>
        <span>${toastMessage}</span>
      </div>
    ` : ''}

    <div class="group-header">Stage Crew Hardware Profile</div>
    <div class="ios-card">
      <div class="cell-row">
        <span class="cell-label">Operator / Venue</span>
        <span class="cell-value">👤 ${clientName}</span>
      </div>
      <div class="cell-row">
        <span class="cell-label">Hardware Machine ID</span>
        <span class="cell-value mono">🖥️ ${machineId}</span>
      </div>
      <div class="cell-row">
        <span class="cell-label">Request Last Seen</span>
        <span class="cell-value">${lastSeen}</span>
      </div>
      <div class="cell-row">
        <span class="cell-label">Access State</span>
        <span class="cell-value">${statusBadgeHtml}</span>
      </div>
    </div>

    <div class="group-header">Instant Access Controls</div>
    <div class="ios-card">
      <a href="${approveUrl}" target="_top" class="btn-cell btn-green">🔓 Grant Approval & Unlock Laptop</a>
      <a href="${rejectUrl}" target="_top" class="btn-cell btn-red">❌ Revoke Access & Lock Console</a>
      <a href="${unblockUrl}" target="_top" class="btn-cell btn-blue">⚡ Clear Block / Unblock Laptop</a>
    </div>

    <div class="group-header">Anti-Spam Security Lockdown</div>
    <div class="ios-card">
      <a href="${block15Url}" target="_top" class="btn-cell btn-orange">🚫 Lockdown & Block for 15 Minutes</a>
      <a href="${block60Url}" target="_top" class="btn-cell btn-red">🚫 Lockdown & Block for 1 Hour</a>
    </div>

    ${superAdminHtml}

    <div class="footer-note">
      Lucky Draw Pro Studio v5.0.0 • Apple iOS Design System<br>
      Role-Based Access Gateway (${isSuperAdmin ? 'Super Admin Privilege Enabled' : 'Standard Admin Mode — Super Admin Features Hidden'})
    </div>
  </div>
</body>
</html>
  `;

  return HtmlService.createHtmlOutput(htmlContent)
    .setTitle("LDP Studio — iOS Gateway Portal")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

