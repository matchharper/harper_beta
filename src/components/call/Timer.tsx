"use client";

import React, { useEffect, useState } from "react";

function Timer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(id); // cleanup
  }, []);

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  // 항상 두 자리로 표시
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");

  return (
    <div className="text-xgray700">
      {mm}:{ss}
    </div>
  );
}

export default React.memo(Timer);
