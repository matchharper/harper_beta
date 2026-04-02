import React from "react";

export const AnimatedGraphics = () => {
  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-24 p-20 bg-white">
      {/* Tailwind config 수정 없이 바로 사용할 수 있도록 
        컴포넌트 내부에 커스텀 애니메이션을 정의합니다. 
      */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes float-layer-1 {
          0%, 100% { transform: translateY(-24px) rotateX(60deg) rotateZ(-45deg); }
          50% { transform: translateY(-36px) rotateX(60deg) rotateZ(-45deg); }
        }
        @keyframes float-layer-2 {
          0%, 100% { transform: translateY(-8px) rotateX(60deg) rotateZ(-45deg); }
          50% { transform: translateY(-12px) rotateX(60deg) rotateZ(-45deg); }
        }
        @keyframes float-layer-3 {
          0%, 100% { transform: translateY(8px) rotateX(60deg) rotateZ(-45deg); }
          50% { transform: translateY(12px) rotateX(60deg) rotateZ(-45deg); }
        }
        .checkerboard {
          background-image:
            linear-gradient(45deg, #f1f5f9 25%, transparent 25%, transparent 75%, #f1f5f9 75%, #f1f5f9),
            linear-gradient(45deg, #f1f5f9 25%, transparent 25%, transparent 75%, #f1f5f9 75%, #f1f5f9);
          background-size: 8px 8px;
          background-position: 0 0, 4px 4px;
        }
      `}</style>

      {/* 1. 데이터 필라 (Floating Pillars) */}
      <div className="relative w-32 h-32 flex items-end justify-center gap-[6px]">
        {[
          { h: 32, d: "0s" },
          { h: 48, d: "0.4s" },
          { h: 80, d: "0.8s" },
          { h: 40, d: "0.2s" },
          { h: 56, d: "0.6s" },
        ].map((pillar, i) => (
          <div
            key={i}
            className="flex flex-col items-center"
            style={{
              animation: "float 3s ease-in-out infinite",
              animationDelay: pillar.d,
            }}
          >
            {/* Top Diamond (상단면) */}
            <div className="w-3 h-3 bg-slate-700 transform rotate-45 scale-y-[0.5] relative z-10 mb-[-3px]" />
            {/* Body (기둥) */}
            <div
              className="w-[17px] bg-gradient-to-b from-slate-100 to-transparent"
              style={{ height: `${pillar.h}px` }}
            />
            {/* Shadow (바닥 반사 그림자) */}
            <div className="w-3 h-3 bg-slate-50 transform rotate-45 scale-y-[0.5] mt-2 opacity-60" />
          </div>
        ))}
      </div>

      {/* 2. 레이어 스택 (Layered Planes) */}
      <div className="relative w-32 h-32 flex items-center justify-center">
        {/* Shadow */}
        <div
          className="absolute w-20 h-20 bg-slate-200 blur-lg opacity-50"
          style={{
            transform:
              "translateY(32px) rotateX(60deg) rotateZ(-45deg) scale(0.9)",
          }}
        />
        {/* Bottom Layer */}
        <div
          className="absolute w-20 h-20 bg-slate-50 border border-slate-100"
          style={{ animation: "float-layer-3 4s ease-in-out infinite" }}
        />
        {/* Middle Layer (Checkerboard) */}
        <div
          className="absolute w-20 h-20 bg-white/50 border border-slate-200 checkerboard"
          style={{ animation: "float-layer-2 4s ease-in-out infinite" }}
        />
        {/* Top Layer */}
        <div
          className="absolute w-20 h-20 bg-slate-700 shadow-xl shadow-slate-300/50"
          style={{ animation: "float-layer-1 4s ease-in-out infinite" }}
        />
      </div>

      {/* 3. 회전하는 스파크 (Spinning Spark) */}
      <div className="relative w-32 h-32 flex items-center justify-center animate-[spin_12s_linear_infinite]">
        {/* Rod 1 */}
        <div className="absolute w-28 h-[10px] bg-gradient-to-r from-transparent via-slate-200 to-transparent transform rotate-0 rounded-full" />
        {/* Rod 2 (Dark Tip) */}
        <div className="absolute w-28 h-[10px] bg-gradient-to-r from-slate-100 via-slate-300 to-slate-200 transform rotate-[60deg] rounded-full flex justify-end items-center">
          <div className="w-2.5 h-2.5 bg-slate-800 rounded-sm transform rotate-45 mr-1" />
        </div>
        {/* Rod 3 */}
        <div className="absolute w-28 h-[10px] bg-gradient-to-r from-transparent via-slate-200 to-transparent transform rotate-[120deg] rounded-full" />
        {/* Center Light (교차점 빛 번짐) */}
        <div className="absolute w-8 h-8 bg-white blur-md rounded-full" />
      </div>
    </div>
  );
};

export const GeometricAnimatedGraphics = () => {
  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-24 p-20 bg-white overflow-hidden">
      <style>{`
        .ga-scene {
          perspective: 1200px;
          transform-style: preserve-3d;
        }

        .ga-soft-glow {
          filter: blur(18px);
          opacity: 0.55;
        }

        .ga-noise {
          background-image:
            radial-gradient(circle at 20% 20%, rgba(255,255,255,0.9) 0, rgba(255,255,255,0) 35%),
            radial-gradient(circle at 80% 30%, rgba(255,255,255,0.6) 0, rgba(255,255,255,0) 28%),
            radial-gradient(circle at 50% 80%, rgba(255,255,255,0.5) 0, rgba(255,255,255,0) 25%);
        }

        /* Cube */
        @keyframes cube-orbit {
          0% {
            transform: rotateX(-24deg) rotateY(0deg) rotateZ(0deg);
          }
          25% {
            transform: rotateX(-30deg) rotateY(90deg) rotateZ(1deg);
          }
          50% {
            transform: rotateX(-20deg) rotateY(180deg) rotateZ(0deg);
          }
          75% {
            transform: rotateX(-30deg) rotateY(270deg) rotateZ(-1deg);
          }
          100% {
            transform: rotateX(-24deg) rotateY(360deg) rotateZ(0deg);
          }
        }

        @keyframes cube-drift {
          0%, 100% {
            transform: translateY(0px) translateX(0px);
          }
          25% {
            transform: translateY(-10px) translateX(2px);
          }
          50% {
            transform: translateY(-18px) translateX(0px);
          }
          75% {
            transform: translateY(-8px) translateX(-2px);
          }
        }

        @keyframes cube-shadow-breathe {
          0%, 100% {
            transform: scale(1);
            opacity: 0.18;
          }
          50% {
            transform: scale(0.82);
            opacity: 0.1;
          }
        }

        /* Grid */
        @keyframes grid-breathe {
          0%, 100% {
            transform: rotateX(68deg) rotateZ(-45deg) translateY(0px) translateZ(0px);
          }
          50% {
            transform: rotateX(68deg) rotateZ(-45deg) translateY(-6px) translateZ(10px);
          }
        }

        @keyframes dot-rise {
          0%, 100% {
            transform: translateZ(0px) scale(1);
            opacity: 0.22;
          }
          50% {
            transform: translateZ(18px) scale(1.4);
            opacity: 0.95;
          }
        }

        @keyframes grid-shimmer {
          0%, 100% {
            opacity: 0.55;
          }
          50% {
            opacity: 0.9;
          }
        }

        /* Rings */
        @keyframes ring-float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-8px);
          }
        }

        @keyframes ring-rotate-a {
          0% {
            transform: rotateX(74deg) rotateY(8deg) rotateZ(0deg);
          }
          100% {
            transform: rotateX(74deg) rotateY(8deg) rotateZ(360deg);
          }
        }

        @keyframes ring-rotate-b {
          0% {
            transform: rotateX(-72deg) rotateY(-12deg) rotateZ(0deg);
          }
          100% {
            transform: rotateX(-72deg) rotateY(-12deg) rotateZ(-360deg);
          }
        }

        @keyframes ring-core-pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.95;
          }
          50% {
            transform: scale(1.12);
            opacity: 0.75;
          }
        }

        @keyframes orbit-dot {
          0% {
            transform: rotate(0deg) translateX(34px) rotate(0deg);
            opacity: 0.7;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: rotate(360deg) translateX(34px) rotate(-360deg);
            opacity: 0.7;
          }
        }
      `}</style>

      {/* 1. Premium glass cube */}
      <div className="relative w-40 h-40 flex items-center justify-center ga-scene">
        <div
          className="absolute bottom-7 w-20 h-6 rounded-full bg-slate-900/10 blur-md"
          style={{ animation: "cube-shadow-breathe 4.6s ease-in-out infinite" }}
        />
        <div
          className="relative w-20 h-20"
          style={{ animation: "cube-drift 4.6s ease-in-out infinite" }}
        >
          <div
            className="absolute inset-0"
            style={{
              transformStyle: "preserve-3d",
              animation:
                "cube-orbit 10s cubic-bezier(0.65, 0.05, 0.36, 1) infinite",
            }}
          >
            {[
              {
                transform: "rotateY(0deg) translateZ(40px)",
                bg: "linear-gradient(135deg, rgba(255,255,255,0.72), rgba(203,213,225,0.18))",
              },
              {
                transform: "rotateY(180deg) translateZ(40px)",
                bg: "linear-gradient(135deg, rgba(226,232,240,0.42), rgba(148,163,184,0.14))",
              },
              {
                transform: "rotateY(90deg) translateZ(40px)",
                bg: "linear-gradient(135deg, rgba(241,245,249,0.58), rgba(148,163,184,0.12))",
              },
              {
                transform: "rotateY(-90deg) translateZ(40px)",
                bg: "linear-gradient(135deg, rgba(241,245,249,0.58), rgba(148,163,184,0.12))",
              },
              {
                transform: "rotateX(90deg) translateZ(40px)",
                bg: "linear-gradient(135deg, rgba(255,255,255,0.82), rgba(226,232,240,0.18))",
              },
              {
                transform: "rotateX(-90deg) translateZ(40px)",
                bg: "linear-gradient(135deg, rgba(226,232,240,0.38), rgba(148,163,184,0.10))",
              },
            ].map((face, i) => (
              <div
                key={i}
                className="absolute w-20 h-20 rounded-[18px] border border-white/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_8px_30px_rgba(15,23,42,0.08)] backdrop-blur-md ga-noise"
                style={{
                  transform: face.transform,
                  backfaceVisibility: "hidden",
                  background: face.bg,
                }}
              />
            ))}
          </div>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-8 h-8 rounded-full bg-slate-200/50 ga-soft-glow" />
          </div>
        </div>
      </div>

      {/* 3. Spherical orbital bands */}
      <div className="relative w-40 h-40 flex items-center justify-center ga-scene">
        <style>{`
    @keyframes sphere-float {
      0%, 100% {
        transform: translateY(0px);
      }
      50% {
        transform: translateY(-8px);
      }
    }

    @keyframes band-1 {
      0% {
        transform: rotateX(72deg) rotateY(10deg) rotateZ(0deg);
      }
      25% {
        transform: rotateX(58deg) rotateY(52deg) rotateZ(90deg);
      }
      50% {
        transform: rotateX(78deg) rotateY(118deg) rotateZ(180deg);
      }
      75% {
        transform: rotateX(46deg) rotateY(210deg) rotateZ(270deg);
      }
      100% {
        transform: rotateX(72deg) rotateY(370deg) rotateZ(360deg);
      }
    }

    @keyframes band-2 {
      0% {
        transform: rotateX(-68deg) rotateY(24deg) rotateZ(0deg);
      }
      25% {
        transform: rotateX(-38deg) rotateY(88deg) rotateZ(-90deg);
      }
      50% {
        transform: rotateX(-76deg) rotateY(164deg) rotateZ(-180deg);
      }
      75% {
        transform: rotateX(-44deg) rotateY(246deg) rotateZ(-270deg);
      }
      100% {
        transform: rotateX(-68deg) rotateY(384deg) rotateZ(-360deg);
      }
    }

    @keyframes band-3 {
      0% {
        transform: rotateX(20deg) rotateY(78deg) rotateZ(0deg);
      }
      25% {
        transform: rotateX(64deg) rotateY(132deg) rotateZ(90deg);
      }
      50% {
        transform: rotateX(14deg) rotateY(214deg) rotateZ(180deg);
      }
      75% {
        transform: rotateX(70deg) rotateY(286deg) rotateZ(270deg);
      }
      100% {
        transform: rotateX(20deg) rotateY(438deg) rotateZ(360deg);
      }
    }

    @keyframes band-4 {
      0% {
        transform: rotateX(84deg) rotateY(-12deg) rotateZ(0deg);
      }
      25% {
        transform: rotateX(40deg) rotateY(62deg) rotateZ(-90deg);
      }
      50% {
        transform: rotateX(88deg) rotateY(146deg) rotateZ(-180deg);
      }
      75% {
        transform: rotateX(52deg) rotateY(220deg) rotateZ(-270deg);
      }
      100% {
        transform: rotateX(84deg) rotateY(348deg) rotateZ(-360deg);
      }
    }

    @keyframes core-pulse {
      0%, 100% {
        transform: scale(1);
        opacity: 0.92;
      }
      50% {
        transform: scale(1.1);
        opacity: 0.72;
      }
    }
  `}</style>

        <div
          className="relative w-28 h-28 flex items-center justify-center"
          style={{
            perspective: "1200px",
            transformStyle: "preserve-3d",
            animation: "sphere-float 4.8s ease-in-out infinite",
          }}
        >
          {/* glow */}
          <div className="absolute w-20 h-20 rounded-full bg-slate-100/100 ga-soft-glow" />

          {/* band 1 */}
          <div
            className="absolute w-full h-[72%] rounded-full border border-slate-300/70"
            style={{
              transformStyle: "preserve-3d",
              animation: "band-1 9.5s ease-in-out infinite",
              boxShadow:
                "0 8px 30px rgba(148,163,184,0.10), inset 0 1px 0 rgba(255,255,255,0.9)",
            }}
          />

          {/* band 2 */}
          <div
            className="absolute w-[92%] h-[58%] rounded-full border border-slate-400/45"
            style={{
              transformStyle: "preserve-3d",
              animation: "band-2 7.8s ease-in-out infinite",
              boxShadow:
                "0 4px 20px rgba(100,116,139,0.08), inset 0 1px 0 rgba(255,255,255,0.5)",
            }}
          />

          {/* band 3 */}
          <div
            className="absolute w-[76%] h-[100%] rounded-full border border-slate-500/35"
            style={{
              transformStyle: "preserve-3d",
              animation: "band-3 6.6s ease-in-out infinite",
              boxShadow: "0 3px 16px rgba(71,85,105,0.08)",
            }}
          />

          {/* band 4 */}
          <div
            className="absolute w-[58%] h-[88%] rounded-full border border-slate-600/25"
            style={{
              transformStyle: "preserve-3d",
              animation: "band-4 5.4s ease-in-out infinite",
            }}
          />

          {/* core */}
          <div
            className="absolute w-7 h-7 rounded-full bg-slate-800 shadow-[0_0_35px_rgba(51,65,85,0.22)]"
            style={{ animation: "core-pulse 2.8s ease-in-out infinite" }}
          />
        </div>
      </div>
    </div>
  );
};

export default function CareerPage2() {
  return <div></div>;
}
