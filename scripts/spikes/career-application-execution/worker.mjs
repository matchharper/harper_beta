const baseUrl = process.env.APPLICATION_SPIKE_URL || "http://127.0.0.1:4317";
const mode = process.argv.includes("--continuous") ? "continuous" : "once";
const maxArgIndex = process.argv.indexOf("--max");
const maxJobs = maxArgIndex >= 0 ? Number(process.argv[maxArgIndex + 1]) : mode === "once" ? 1 : Infinity;
const workerName = process.env.APPLICATION_SPIKE_WORKER || `server-worker-${process.pid}`;

async function claim() {
  const response = await fetch(`${baseUrl}/api/worker/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ worker: workerName }),
  });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`claim_failed:${response.status}`);
  return response.json();
}

async function update(requestId, body) {
  const response = await fetch(`${baseUrl}/api/worker/${requestId}/update`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`update_failed:${response.status}`);
  return response.json();
}

async function processRequest(request) {
  if (request.target !== "mock_api") {
    const updated = await update(request.id, {
      status: "awaiting_browser_executor",
      blocking_reason: "browser_executor_required",
    });
    console.log(JSON.stringify({ action: "browser_handoff", request: updated }, null, 2));
    return;
  }

  const response = await fetch(`${baseUrl}/api/mock-ats/applications`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      request_id: request.id,
      role: "platform_engineer",
      email: request.email,
      full_name: "Harper Test Candidate",
      resume_version: "fixture-v1",
      work_authorization: "confirmed_yes",
    }),
  });
  const result = await response.json();

  if (response.status === 409 && result.existing_receipt) {
    const updated = await update(request.id, {
      status: "duplicate_detected",
      receipt_id: result.existing_receipt,
    });
    console.log(JSON.stringify({ action: "duplicate", request: updated }, null, 2));
    return;
  }

  if (!response.ok || !result.application_id) {
    const updated = await update(request.id, {
      status: "failed_retryable",
      failure_reason: `partner_api_${response.status}`,
    });
    console.log(JSON.stringify({ action: "failed", request: updated }, null, 2));
    return;
  }

  const updated = await update(request.id, {
    status: "submitted_verified",
    receipt_id: result.application_id,
  });
  console.log(JSON.stringify({ action: "submitted", request: updated }, null, 2));
}

let processed = 0;
while (processed < maxJobs) {
  const request = await claim();
  if (!request) {
    if (mode === "once") break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    continue;
  }
  await processRequest(request);
  processed += 1;
}

console.log(JSON.stringify({ worker: workerName, mode, processed }, null, 2));
