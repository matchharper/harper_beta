export const notifyToSlack = async (message: string) => {
  const response = await fetch("/api/hello", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: message }),
  });
  const data = await response.json();
};

export const notifyUsageToSlack = async (message: string) => {
  const response = await fetch("/api/hello/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: message }),
  });
  const data = await response.json();
};
