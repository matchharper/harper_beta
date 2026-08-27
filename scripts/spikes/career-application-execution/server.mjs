import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

const port = Number(process.env.APPLICATION_SPIKE_PORT || 4317);
const root = process.cwd();
const artifactDir = path.resolve(root, "output/playwright/career-application-execution");
const statePath = path.join(artifactDir, "state.json");
const resumePath = path.join(artifactDir, "fixture-resume.pdf");

fs.mkdirSync(artifactDir, { recursive: true });

if (!fs.existsSync(resumePath)) {
  const fixture = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj
4 0 obj<</Length 72>>stream
BT /F1 18 Tf 72 720 Td (Harper Application Execution Test Resume) Tj ET
endstream endobj
trailer<</Root 1 0 R>>
%%EOF
`;
  fs.writeFileSync(resumePath, fixture);
}

function initialState() {
  return { requests: [], submissions: [], sessions: {}, events: [] };
}

function loadState() {
  if (!fs.existsSync(statePath)) return initialState();
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return initialState();
  }
}

let state = loadState();

function saveState() {
  const tempPath = `${statePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tempPath, statePath);
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function now() {
  return new Date().toISOString();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function page(title, content) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #f6f5f1; color: #222; }
    main { max-width: 760px; margin: 48px auto; padding: 32px; background: white; border: 1px solid #ddd8cc; border-radius: 18px; box-shadow: 0 10px 30px #00000010; }
    h1 { margin-top: 0; font-size: 30px; }
    h2 { margin-top: 32px; }
    p, li { line-height: 1.55; }
    label, fieldset { display: block; margin: 18px 0; }
    label > span, legend { display: block; margin-bottom: 7px; font-weight: 650; }
    input, textarea, select, button { font: inherit; }
    input[type=text], input[type=email], input[type=tel], input[type=date], input[type=password], input[type=file], textarea, select {
      width: 100%; box-sizing: border-box; border: 1px solid #aaa; border-radius: 10px; padding: 11px 12px; background: white;
    }
    textarea { min-height: 120px; resize: vertical; }
    fieldset { border: 1px solid #ccc; border-radius: 10px; padding: 14px; }
    .choice { display: inline-flex; gap: 7px; margin: 7px 18px 7px 0; align-items: center; }
    button, .button { display: inline-block; border: 0; border-radius: 999px; padding: 11px 18px; color: white; background: #222; cursor: pointer; text-decoration: none; }
    .muted { color: #666; }
    .notice { padding: 13px 15px; border-radius: 10px; background: #fff7d6; border: 1px solid #e7cf67; }
    .success { padding: 16px; border-radius: 10px; background: #eaf8ed; border: 1px solid #77ba83; }
    .error { padding: 16px; border-radius: 10px; background: #fff0f0; border: 1px solid #cf7777; }
    code { background: #f0efe9; padding: 2px 5px; border-radius: 5px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 9px; border-bottom: 1px solid #ddd; }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function sendHtml(res, status, body) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function readBody(req) {
  const raw = await readRaw(req);
  const type = req.headers["content-type"] || "";
  if (type.includes("application/json")) return JSON.parse(raw.toString("utf8") || "{}");
  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw.toString("utf8")));
  }
  if (type.includes("multipart/form-data")) return parseMultipart(raw, type);
  return { raw: raw.toString("utf8") };
}

function parseMultipart(raw, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) return {};
  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const text = raw.toString("latin1");
  const result = {};
  for (const part of text.split(boundary)) {
    const [headers = "", ...bodyParts] = part.split("\r\n\r\n");
    const name = headers.match(/name="([^"]+)"/i)?.[1];
    if (!name) continue;
    const filename = headers.match(/filename="([^"]*)"/i)?.[1];
    const body = bodyParts.join("\r\n\r\n").replace(/\r\n--?$/, "").replace(/\r\n$/, "");
    result[name] = filename ? { filename, size: Buffer.byteLength(body, "latin1") } : body;
  }
  return result;
}

function requestById(requestId) {
  return state.requests.find((item) => item.id === requestId);
}

function addEvent(type, data = {}) {
  state.events.push({ id: id("evt"), type, at: now(), ...data });
}

function recordSubmission({ provider, role, email, fields, requestId, uncertain = false }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const duplicate = state.submissions.find(
    (item) => item.provider === provider && item.role === role && item.email === normalizedEmail,
  );
  if (duplicate) return { duplicate };
  const receipt = {
    id: id("receipt"),
    provider,
    role,
    email: normalizedEmail,
    fields,
    request_id: requestId || null,
    submitted_at: now(),
    uncertain_transport: uncertain,
  };
  state.submissions.push(receipt);
  addEvent("submission_recorded", { receipt_id: receipt.id, provider, request_id: requestId || null });
  saveState();
  return { receipt };
}

function receiptPage(receipt) {
  return page(
    "지원 완료",
    `<h1>지원이 접수되었습니다</h1>
     <div class="success" role="status">
       <strong>Application reference</strong><br>
       <code>${escapeHtml(receipt.id)}</code>
     </div>
     <p>Role: ${escapeHtml(receipt.role)}</p>
     <p>Email: ${escapeHtml(receipt.email)}</p>
     <p><a class="button" href="/">테스트 홈으로</a></p>`,
  );
}

function duplicatePage(receipt) {
  return page(
    "중복 지원 감지",
    `<h1>이미 접수된 지원서가 있습니다</h1>
     <div class="notice" role="alert">새 지원서는 생성하지 않았습니다.</div>
     <p>Existing application reference: <code>${escapeHtml(receipt.id)}</code></p>`,
  );
}

function home() {
  return page(
    "Harper Application Execution Spike",
    `<h1>Harper Application Execution Spike</h1>
     <p>실제 회사에 제출하지 않는 로컬 모의 채용 환경입니다.</p>
     <h2>지원 폼</h2>
     <ul>
       <li><a href="/apply/simple">SimpleBoard — 단일 페이지 + PDF 업로드</a></li>
       <li><a href="/apply/dynamic">FlowHire — 다단계 + 조건부 질문</a></li>
       <li><a href="/apply/login">GateWorks — 로그인 + OTP 인계</a></li>
       <li><a href="/apply/uncertain">TimeoutATS — 서버 접수 후 504</a></li>
     </ul>
     <h2>비동기 실행</h2>
     <ul>
       <li><a href="/career">모의 /career 지원 요청</a></li>
       <li><a href="/ops">큐와 제출 결과</a></li>
       <li><a href="/api/state">JSON state</a></li>
     </ul>`,
  );
}

function careerPage(message = "") {
  return page(
    "모의 Career 요청",
    `<h1>/career 지원 요청</h1>
     ${message}
     <form method="post" action="/career/request">
       <label><span>지원할 역할</span>
         <select name="target" required>
           <option value="mock_api">Partner API — Platform Engineer</option>
           <option value="simple_browser">SimpleBoard — Product Engineer</option>
           <option value="dynamic_browser">FlowHire — AI Product Lead</option>
           <option value="login_browser">GateWorks — Security Engineer</option>
           <option value="uncertain_browser">TimeoutATS — Data Engineer</option>
         </select>
       </label>
       <label><span>사용자 요청</span>
         <textarea name="instruction" required>이 역할에 지원해줘.</textarea>
       </label>
       <label><span>지원 이메일</span><input type="email" name="email" value="harper.test@example.com" required></label>
       <button type="submit">지원 요청 저장</button>
     </form>`,
  );
}

function simpleForm() {
  return page(
    "SimpleBoard 지원",
    `<h1>Product Engineer 지원</h1>
     <p class="muted">SimpleBoard · Seoul / Remote</p>
     <form method="post" action="/submit/simple" enctype="multipart/form-data">
       <label><span>Full legal name</span><input type="text" name="full_name" autocomplete="name" required></label>
       <label><span>Email address</span><input type="email" name="email" autocomplete="email" required></label>
       <label><span>Mobile phone</span><input type="tel" name="phone" autocomplete="tel" required></label>
       <label><span>Resume (PDF)</span><input type="file" name="resume" accept="application/pdf,.pdf" required></label>
       <label><span>Why are you interested in this role?</span><textarea name="motivation" required></textarea></label>
       <fieldset><legend>Are you legally authorized to work in Korea?</legend>
         <label class="choice"><input type="radio" name="work_auth" value="yes" required> Yes</label>
         <label class="choice"><input type="radio" name="work_auth" value="no"> No</label>
       </fieldset>
       <label class="choice"><input type="checkbox" name="truth" value="yes" required> I certify that the information is accurate.</label><br>
       <button type="submit">Submit application</button>
     </form>`,
  );
}

function dynamicStep1() {
  return page(
    "FlowHire 1/3",
    `<p class="muted">Step 1 of 3</p><h1>AI Product Lead 지원</h1>
     <form method="post" action="/apply/dynamic/step2" enctype="multipart/form-data">
       <label><span>Candidate name</span><input type="text" name="candidate_name" required></label>
       <label><span>Best email for recruiting updates</span><input type="email" name="email" required></label>
       <label><span>Current city</span><input type="text" name="city" required></label>
       <label><span>Upload CV</span><input type="file" name="resume" accept="application/pdf,.pdf" required></label>
       <button type="submit">Continue to eligibility</button>
     </form>`,
  );
}

function dynamicStep2(token) {
  return page(
    "FlowHire 2/3",
    `<p class="muted">Step 2 of 3</p><h1>Eligibility</h1>
     <form method="post" action="/apply/dynamic/step3">
       <input type="hidden" name="token" value="${escapeHtml(token)}">
       <fieldset><legend>Will you now or in the future require visa sponsorship in Korea?</legend>
         <label class="choice"><input type="radio" name="sponsorship" value="yes" required> Yes</label>
         <label class="choice"><input type="radio" name="sponsorship" value="no"> No</label>
       </fieldset>
       <label><span>Earliest available start date</span><input type="date" name="start_date" required></label>
       <label><span>Preferred work arrangement</span>
         <select name="work_mode" required><option value="">Choose one</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option><option value="office">Office</option></select>
       </label>
       <button type="submit">Continue to role questions</button>
     </form>`,
  );
}

function dynamicStep3(token) {
  return page(
    "FlowHire 3/3",
    `<p class="muted">Step 3 of 3</p><h1>Role questions</h1>
     <div class="notice">This role was updated today. Travel availability is now required.</div>
     <form method="post" action="/submit/dynamic">
       <input type="hidden" name="token" value="${escapeHtml(token)}">
       <label><span>Describe one product you took from discovery to launch.</span><textarea name="product_story" required></textarea></label>
       <fieldset><legend>Can you travel internationally up to 20%?</legend>
         <label class="choice"><input type="radio" name="travel" value="yes" required> Yes</label>
         <label class="choice"><input type="radio" name="travel" value="no"> No</label>
       </fieldset>
       <label class="choice"><input type="checkbox" name="privacy" value="yes" required> I agree to the applicant privacy notice.</label><br>
       <button type="submit">Send my application</button>
     </form>`,
  );
}

function loginForm(error = "") {
  return page(
    "GateWorks 로그인",
    `<h1>Candidate portal sign in</h1>
     ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ""}
     <form method="post" action="/apply/login/otp">
       <label><span>Email</span><input type="email" name="email" required></label>
       <label><span>Password</span><input type="password" name="password" required></label>
       <button type="submit">Sign in</button>
     </form>`,
  );
}

function otpForm(token, error = "") {
  return page(
    "GateWorks verification",
    `<h1>Verify your sign-in</h1>
     <p>Enter the six-digit code sent to your email. This step must be completed by the candidate.</p>
     ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ""}
     <form method="post" action="/apply/login/verify">
       <input type="hidden" name="token" value="${escapeHtml(token)}">
       <label><span>Verification code</span><input type="text" name="otp" inputmode="numeric" minlength="6" maxlength="6" required></label>
       <button type="submit">Verify</button>
     </form>`,
  );
}

function loginApplication(token) {
  return page(
    "GateWorks 지원",
    `<h1>Security Engineer 지원</h1>
     <form method="post" action="/submit/login" enctype="multipart/form-data">
       <input type="hidden" name="token" value="${escapeHtml(token)}">
       <label><span>Full name</span><input type="text" name="full_name" required></label>
       <label><span>Phone</span><input type="tel" name="phone" required></label>
       <label><span>Resume</span><input type="file" name="resume" accept="application/pdf,.pdf" required></label>
       <label><span>Security leadership example</span><textarea name="leadership" required></textarea></label>
       <label class="choice"><input type="checkbox" name="truth" value="yes" required> I certify these answers are mine and accurate.</label><br>
       <button type="submit">Complete application</button>
     </form>`,
  );
}

function uncertainForm() {
  return page(
    "TimeoutATS 지원",
    `<h1>Data Engineer 지원</h1>
     <p class="notice">This mock endpoint records the submission, then returns a gateway timeout.</p>
     <form method="post" action="/submit/uncertain">
       <label><span>Name</span><input type="text" name="name" required></label>
       <label><span>Email</span><input type="email" name="email" required></label>
       <label><span>Most relevant data project</span><textarea name="project" required></textarea></label>
       <button type="submit">Submit</button>
     </form>`,
  );
}

function opsPage() {
  const requests = state.requests
    .map((item) => `<tr><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.target)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.receipt_id || "-")}</td></tr>`)
    .join("");
  const submissions = state.submissions
    .map((item) => `<tr><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.provider)}</td><td>${escapeHtml(item.role)}</td><td>${escapeHtml(item.email)}</td></tr>`)
    .join("");
  return page(
    "Application Ops",
    `<h1>Application Ops</h1>
     <h2>Requests</h2><table><thead><tr><th>ID</th><th>Target</th><th>Status</th><th>Receipt</th></tr></thead><tbody>${requests || "<tr><td colspan=4>Empty</td></tr>"}</tbody></table>
     <h2>Submissions</h2><table><thead><tr><th>Receipt</th><th>Provider</th><th>Role</th><th>Email</th></tr></thead><tbody>${submissions || "<tr><td colspan=4>Empty</td></tr>"}</tbody></table>`,
  );
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `127.0.0.1:${port}`}`);
  const pathname = url.pathname;

  try {
    if (req.method === "GET" && pathname === "/") return sendHtml(res, 200, home());
    if (req.method === "GET" && pathname === "/career") return sendHtml(res, 200, careerPage());
    if (req.method === "GET" && pathname === "/ops") return sendHtml(res, 200, opsPage());
    if (req.method === "GET" && pathname === "/fixture-resume.pdf") {
      res.writeHead(200, { "content-type": "application/pdf", "content-disposition": "attachment; filename=fixture-resume.pdf" });
      return res.end(fs.readFileSync(resumePath));
    }

    if (req.method === "GET" && pathname === "/apply/simple") return sendHtml(res, 200, simpleForm());
    if (req.method === "GET" && pathname === "/apply/dynamic") return sendHtml(res, 200, dynamicStep1());
    if (req.method === "GET" && pathname === "/apply/login") return sendHtml(res, 200, loginForm());
    if (req.method === "GET" && pathname === "/apply/uncertain") return sendHtml(res, 200, uncertainForm());

    if (req.method === "POST" && pathname === "/career/request") {
      const body = await readBody(req);
      const request = {
        id: id("app"),
        target: body.target,
        instruction: body.instruction,
        email: String(body.email || "").toLowerCase(),
        status: "queued",
        attempts: 0,
        created_at: now(),
        updated_at: now(),
        events: [{ type: "intent_saved", at: now() }],
      };
      state.requests.push(request);
      addEvent("request_queued", { request_id: request.id, target: request.target });
      saveState();
      return sendHtml(
        res,
        202,
        careerPage(`<div class="success" role="status">지원 요청을 저장했습니다. Application ID: <code>${escapeHtml(request.id)}</code>. 현재 상태: queued</div>`),
      );
    }

    if (req.method === "POST" && pathname === "/submit/simple") {
      const body = await readBody(req);
      const validation = ["full_name", "email", "phone", "motivation", "work_auth", "truth"].filter((key) => !body[key]);
      if (!body.resume?.filename?.toLowerCase().endsWith(".pdf")) validation.push("resume_pdf");
      if (validation.length) return sendHtml(res, 422, page("지원서 오류", `<h1>Required fields missing</h1><div class="error">${validation.join(", ")}</div>`));
      const result = recordSubmission({ provider: "simpleboard", role: "product_engineer", email: body.email, fields: body });
      if (result.duplicate) return sendHtml(res, 409, duplicatePage(result.duplicate));
      return sendHtml(res, 201, receiptPage(result.receipt));
    }

    if (req.method === "POST" && pathname === "/apply/dynamic/step2") {
      const body = await readBody(req);
      if (!body.candidate_name || !body.email || !body.city || !body.resume?.filename) {
        return sendHtml(res, 422, page("지원서 오류", "<h1>Step 1 fields are incomplete</h1>"));
      }
      const token = id("flow");
      state.sessions[token] = { provider: "flowhire", data: body, created_at: now() };
      saveState();
      return sendHtml(res, 200, dynamicStep2(token));
    }

    if (req.method === "POST" && pathname === "/apply/dynamic/step3") {
      const body = await readBody(req);
      const session = state.sessions[body.token];
      if (!session || !body.sponsorship || !body.start_date || !body.work_mode) {
        return sendHtml(res, 422, page("지원서 오류", "<h1>Eligibility fields are incomplete</h1>"));
      }
      session.data = { ...session.data, ...body };
      saveState();
      return sendHtml(res, 200, dynamicStep3(body.token));
    }

    if (req.method === "POST" && pathname === "/submit/dynamic") {
      const body = await readBody(req);
      const session = state.sessions[body.token];
      if (!session || !body.product_story || !body.travel || !body.privacy) {
        return sendHtml(res, 422, page("지원서 오류", "<h1>Role questions are incomplete</h1>"));
      }
      const fields = { ...session.data, ...body };
      const result = recordSubmission({ provider: "flowhire", role: "ai_product_lead", email: fields.email, fields });
      if (result.duplicate) return sendHtml(res, 409, duplicatePage(result.duplicate));
      return sendHtml(res, 201, receiptPage(result.receipt));
    }

    if (req.method === "POST" && pathname === "/apply/login/otp") {
      const body = await readBody(req);
      if (!body.email || !body.password) return sendHtml(res, 422, loginForm("Email and password are required."));
      const token = id("gate");
      state.sessions[token] = { provider: "gateworks", email: String(body.email).toLowerCase(), otp_verified: false, created_at: now() };
      saveState();
      return sendHtml(res, 200, otpForm(token));
    }

    if (req.method === "POST" && pathname === "/apply/login/verify") {
      const body = await readBody(req);
      const session = state.sessions[body.token];
      if (!session) return sendHtml(res, 410, page("세션 만료", "<h1>Session expired</h1>"));
      if (body.otp !== "482913") return sendHtml(res, 401, otpForm(body.token, "The verification code is incorrect."));
      session.otp_verified = true;
      saveState();
      return sendHtml(res, 200, loginApplication(body.token));
    }

    if (req.method === "POST" && pathname === "/submit/login") {
      const body = await readBody(req);
      const session = state.sessions[body.token];
      if (!session?.otp_verified) return sendHtml(res, 401, page("인증 필요", "<h1>Verification required</h1>"));
      const validation = ["full_name", "phone", "leadership", "truth"].filter((key) => !body[key]);
      if (!body.resume?.filename) validation.push("resume");
      if (validation.length) return sendHtml(res, 422, page("지원서 오류", `<h1>Required fields missing</h1><div class="error">${validation.join(", ")}</div>`));
      const result = recordSubmission({ provider: "gateworks", role: "security_engineer", email: session.email, fields: body });
      if (result.duplicate) return sendHtml(res, 409, duplicatePage(result.duplicate));
      return sendHtml(res, 201, receiptPage(result.receipt));
    }

    if (req.method === "POST" && pathname === "/submit/uncertain") {
      const body = await readBody(req);
      if (!body.name || !body.email || !body.project) return sendHtml(res, 422, page("지원서 오류", "<h1>Required fields missing</h1>"));
      const result = recordSubmission({ provider: "timeoutats", role: "data_engineer", email: body.email, fields: body, uncertain: true });
      if (result.duplicate) return sendHtml(res, 409, duplicatePage(result.duplicate));
      return sendHtml(res, 504, page("Gateway Timeout", `<h1>504 Gateway Timeout</h1><p>The browser did not receive a submission confirmation.</p>`));
    }

    if (req.method === "POST" && pathname === "/api/mock-ats/applications") {
      const body = await readBody(req);
      if (!body.email || !body.role) return sendJson(res, 422, { error: "email_and_role_required" });
      const result = recordSubmission({ provider: "partner_api", role: body.role, email: body.email, fields: body, requestId: body.request_id });
      if (result.duplicate) return sendJson(res, 409, { error: "duplicate", existing_receipt: result.duplicate.id });
      return sendJson(res, 201, { status: "submitted", application_id: result.receipt.id });
    }

    if (req.method === "GET" && pathname === "/api/receipts") {
      const email = String(url.searchParams.get("email") || "").toLowerCase();
      const provider = url.searchParams.get("provider");
      const receipts = state.submissions.filter((item) => (!email || item.email === email) && (!provider || item.provider === provider));
      return sendJson(res, 200, { receipts });
    }

    if (req.method === "GET" && pathname === "/api/state") return sendJson(res, 200, state);

    if (req.method === "POST" && pathname === "/api/reset") {
      state = initialState();
      saveState();
      return sendJson(res, 200, { status: "reset" });
    }

    if (req.method === "POST" && pathname === "/api/worker/claim") {
      const body = await readBody(req);
      const currentTime = Date.now();
      const request = state.requests.find(
        (item) => item.status === "queued" || (item.status === "executing" && Date.parse(item.lease_until || 0) < currentTime),
      );
      if (!request) return sendJson(res, 204, {});
      request.status = "executing";
      request.worker = body.worker || "anonymous-worker";
      request.attempts += 1;
      request.lease_until = new Date(currentTime + 60_000).toISOString();
      request.updated_at = now();
      request.events.push({ type: "claimed", worker: request.worker, at: now() });
      saveState();
      return sendJson(res, 200, request);
    }

    const updateMatch = pathname.match(/^\/api\/worker\/([^/]+)\/update$/);
    if (req.method === "POST" && updateMatch) {
      const body = await readBody(req);
      const request = requestById(updateMatch[1]);
      if (!request) return sendJson(res, 404, { error: "request_not_found" });
      request.status = body.status || request.status;
      request.receipt_id = body.receipt_id || request.receipt_id;
      if (Object.hasOwn(body, "failure_reason")) request.failure_reason = body.failure_reason;
      if (Object.hasOwn(body, "blocking_reason")) request.blocking_reason = body.blocking_reason;
      if (request.status === "submitted_verified") {
        request.failure_reason = null;
        request.blocking_reason = null;
      }
      request.updated_at = now();
      request.lease_until = null;
      request.events.push({ type: "worker_update", status: request.status, receipt_id: request.receipt_id || null, at: now() });
      saveState();
      return sendJson(res, 200, request);
    }

    const requestMatch = pathname.match(/^\/api\/applications\/([^/]+)$/);
    if (req.method === "GET" && requestMatch) {
      const request = requestById(requestMatch[1]);
      if (!request) return sendJson(res, 404, { error: "request_not_found" });
      return sendJson(res, 200, request);
    }

    return sendHtml(res, 404, page("Not Found", `<h1>Not Found</h1><p>${escapeHtml(pathname)}</p>`));
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "server_error", message: error.message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Application execution spike listening on http://127.0.0.1:${port}`);
  console.log(`State: ${statePath}`);
  console.log(`Resume fixture: ${resumePath}`);
});
