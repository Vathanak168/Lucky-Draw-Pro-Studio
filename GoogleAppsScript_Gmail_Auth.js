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
      // ១. កត់ត្រាសំណើចូល Properties Store
      props.setProperty(`REQ_${machineId}`, JSON.stringify({
        machine_id: machineId,
        client_name: clientName,
        status: "PENDING",
        timestamp: timestamp
      }));

      // ២. បង្កើត Link Approve និង Reject សម្រាប់ចុចក្នុង Gmail
      const scriptUrl = ScriptApp.getService().getUrl();
      const approveUrl = `${scriptUrl}?action=approve&machine_id=${encodeURIComponent(machineId)}&token=${ADMIN_SECRET_TOKEN}`;
      const rejectUrl = `${scriptUrl}?action=reject&machine_id=${encodeURIComponent(machineId)}&token=${ADMIN_SECRET_TOKEN}`;

      // ៣. ផ្ញើ Email ចូល Gmail របស់អ្នកភ្លាមៗ!
      const emailSubject = `🚨 [REMOTE UNLOCK REQUEST] Stage Crew: ${clientName} (${machineId})`;
      const emailHtml = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 520px; background-color: #161616; color: #ffffff; padding: 28px; border-radius: 12px; border: 2px solid #00e5a3;">
          <div style="text-align: center; border-bottom: 1px solid #333333; padding-bottom: 16px; margin-bottom: 20px;">
            <h2 style="color: #00e5a3; margin: 0; font-size: 20px;">🔒 LDP STUDIO GATEKEEPER</h2>
            <p style="color: #aaaaaa; font-size: 13px; margin: 4px 0 0;">Remote Unlock Request Notification</p>
          </div>
          
          <p style="color: #cccccc; font-size: 14px; line-height: 1.6;">
            បុគ្គលិកកំពុងស្នើសុំបើកសោរកម្មវិធី <b>Lucky Draw Pro Studio (v5.0.0)</b> លើកុំព្យូទ័រដូចខាងក្រោម៖
          </p>
          
          <div style="background-color: #1e1e1e; border-left: 4px solid #00e5a3; padding: 14px; margin: 20px 0; border-radius: 4px;">
            <div style="font-size: 13px; color: #aaaaaa;">ឈ្មោះបុគ្គលិក / ទីតាំង៖</div>
            <div style="font-size: 16px; font-weight: bold; color: #ffffff; margin-bottom: 8px;">👤 ${clientName}</div>
            <div style="font-size: 13px; color: #aaaaaa;">Hardware Machine Binding ID៖</div>
            <div style="font-size: 15px; font-family: monospace; font-weight: bold; color: #f59e0b;">🖥️ ${machineId}</div>
          </div>

          <div style="text-align: center; margin: 28px 0 20px;">
            <a href="${approveUrl}" style="background-color: #00e5a3; color: #000000; font-weight: bold; text-decoration: none; padding: 14px 24px; border-radius: 6px; font-size: 14px; display: inline-block; box-shadow: 0 0 15px rgba(0,229,163,0.4);">
              🔓 APPROVE & UNLOCK LAPTOP NOW
            </a>
          </div>

          <div style="text-align: center; margin-top: 16px;">
            <a href="${rejectUrl}" style="color: #ef4444; text-decoration: underline; font-size: 12px;">
              ❌ Reject Request / Keep Locked
            </a>
          </div>

          <div style="border-top: 1px solid #333333; margin-top: 24px; padding-top: 12px; font-size: 11px; color: #666666; text-align: center;">
            Lucky Draw Pro Studio v5.0.0 • Hardware Anti-Piracy Security System
          </div>
        </div>
      `;

      MailApp.sendEmail({
        to: ADMIN_GMAIL_ADDRESS,
        subject: emailSubject,
        htmlBody: emailHtml
      });

      return ContentService.createTextOutput(JSON.stringify({
        status: "SUCCESS",
        message: "Request emailed to Admin Gmail! Awaiting confirmation."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "set_password" || action === "sync_password") {
      if (data.token !== ADMIN_SECRET_TOKEN) {
        return ContentService.createTextOutput(JSON.stringify({ status: "ERROR", message: "Unauthorized Super Admin Token" })).setMimeType(ContentService.MimeType.JSON);
      }
      if (action === "set_password") {
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
      return ContentService.createTextOutput(JSON.stringify({
        status: "OK",
        global_password: props.getProperty("GLOBAL_MASTER_PASSWORD") || "resolume2026",
        password_version: parseInt(props.getProperty("GLOBAL_PASSWORD_VERSION") || "0")
      })).setMimeType(ContentService.MimeType.JSON);
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

  // ១. ករណី Admin ចុច Link "APPROVE" ក្នុង Gmail
  if (action === "approve") {
    if (token !== ADMIN_SECRET_TOKEN) {
      return ContentService.createTextOutput("Unauthorized / Invalid Token");
    }
    props.setProperty(`STATUS_${machineId}`, "APPROVED");
    return ContentService.createTextOutput(`
      <html>
      <body style="background:#161616; color:#fff; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0;">
        <div style="background:#1e1e1e; border:2px solid #00e5a3; padding:40px; border-radius:10px; text-align:center; max-width:450px;">
          <h1 style="color:#00e5a3; margin-bottom:10px;">✅ LAPTOP UNLOCKED!</h1>
          <p style="color:#aaa; line-height:1.6;">Machine ID <b>${machineId}</b> has been successfully approved for remote access. The laptop console will unlock in 3 seconds.</p>
          <div style="margin-top:20px; font-size:12px; color:#666;">You can close this tab now.</div>
        </div>
      </body>
      </html>
    `).setMimeType(ContentService.MimeType.HTML);
  }

  // ២. ករណី Admin ចុច Link "REJECT" ក្នុង Gmail
  if (action === "reject") {
    props.setProperty(`STATUS_${machineId}`, "REJECTED");
    return ContentService.createTextOutput(`
      <html>
      <body style="background:#161616; color:#fff; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0;">
        <div style="background:#1e1e1e; border:2px solid #ef4444; padding:40px; border-radius:10px; text-align:center; max-width:450px;">
          <h1 style="color:#ef4444; margin-bottom:10px;">❌ REQUEST REJECTED</h1>
          <p style="color:#aaa; line-height:1.6;">Machine ID <b>${machineId}</b> has been denied access and remains locked.</p>
        </div>
      </body>
      </html>
    `).setMimeType(ContentService.MimeType.HTML);
  }

  // ៣. ករណី Laptop លើឆាកធ្វើការ Polling ពិនិត្យមើល status (`GET ?action=check&machine_id=...`)
  if (action === "check" && machineId) {
    const status = props.getProperty(`STATUS_${machineId}`);
    const globalPassword = props.getProperty("GLOBAL_MASTER_PASSWORD") || "resolume2026";
    const passwordVersion = parseInt(props.getProperty("GLOBAL_PASSWORD_VERSION") || "0");
    if (status === "APPROVED") {
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

  // ៤. ករណី Laptop ស្នើសុំ Sync Password បិទបើកតាម Wi-Fi (`GET ?action=sync_password`)
  if (action === "sync_password") {
    return ContentService.createTextOutput(JSON.stringify({
      status: "OK",
      global_password: props.getProperty("GLOBAL_MASTER_PASSWORD") || "resolume2026",
      password_version: parseInt(props.getProperty("GLOBAL_PASSWORD_VERSION") || "0")
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ៥. ករណី Super Admin ចុចបើកផ្ទាំងគ្រប់គ្រង Password (`GET ?action=set_password&new_password=...&token=...`)
  if (action === "set_password") {
    if (token !== ADMIN_SECRET_TOKEN) return ContentService.createTextOutput("Unauthorized Token");
    const newPassword = e.parameter.new_password;
    if (!newPassword) return ContentService.createTextOutput("Please provide new_password parameter.");
    const newVersion = Date.now();
    props.setProperty("GLOBAL_MASTER_PASSWORD", newPassword);
    props.setProperty("GLOBAL_PASSWORD_VERSION", newVersion.toString());
    return ContentService.createTextOutput(`
      <html><body style="background:#161616; color:#fff; font-family:sans-serif; text-align:center; padding:50px;">
        <div style="background:#1e1e1e; border:2px solid #00e5a3; padding:40px; border-radius:12px; display:inline-block;">
          <h1 style="color:#00e5a3;">🌐 SUPER ADMIN PASSWORD CHANGED!</h1>
          <p>New Master Password: <b style="font-size:20px; color:#fff;">${newPassword}</b></p>
          <p style="color:#aaa;">All connected laptops across all venues will immediately sync and update to this password!</p>
        </div>
      </body></html>
    `).setMimeType(ContentService.MimeType.HTML);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: "OK", service: "LDP Gatekeeper Webhook v5.0 (With Super Admin Sync)" })).setMimeType(ContentService.MimeType.JSON);
}
