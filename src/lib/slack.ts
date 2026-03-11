export const notifyToSlack = async (message: string) => {
  if (process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true") return;
  const response = await fetch("/api/hello", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: message }),
  });
  const data = await response.json();
};

export const notifyUsageToSlack = async (message: string) => {
  if (process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true") return null;
  try {
    const response = await fetch("/api/hello/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message }),
    });
    const data = await response.json();
    return data;
  } catch (error) {
    // Slack 알림 실패는 검색 기능에 영향을 주지 않음
    console.error("Failed to notify usage to Slack:", error);
    return null;
  }
};
