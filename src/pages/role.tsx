import Appbar from "@/components/Appbar";
import { ChevronsLeft, Globe, Monitor } from "lucide-react";
import { useRouter } from "next/router";
import React, { useState } from "react";

const Role = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const router = useRouter();

  const onApply = () => {
    router.push("/apply");
  };

  return (
    <main className="min-h-screen bg-white text-black px-4 pt-24 flex flex-row items-start justify-center gap-8 lg:gap-[64px]">
      <Appbar />
      <div className="flex flex-col gap-2 lg:w-[50%] md:w-[60%] w-full">
        <div className="text-brightnavy mb-10 text-[14px] cursor-pointer flex flex-row items-center gap-1">
          <ChevronsLeft size={16} />
          <div>Back</div>
        </div>
        <div className="flex flex-col gap-[12px]">
          <div className="text-2xl font-medium">ML Pipeline Engineer</div>
          <div className="flex flex-row justify-between items-center text-brightnavy text-[14px]">
            <div className="flex flex-row items-center gap-1">
              <Monitor size={14} />
              <div>Full time</div>
            </div>
            <div className="flex flex-row items-center gap-1">
              <Globe size={14} />
              <div>Seoul / San Francisco</div>
            </div>
          </div>
        </div>
        <div></div>
        <div></div>
        <div className="flex flex-col gap-[24px]">
          {Texts.map((item) => (
            <div
              key={item.title}
              className="flex flex-col gap-2 pt-[18px] border-t border-xgray300"
            >
              <div className="text-[15px] font-semibold">{item.title}</div>
              <div
                dangerouslySetInnerHTML={{ __html: item.description }}
                className="whitespace-pre-line text-[15px] font-light leading-6 text-xgray600"
              ></div>
            </div>
          ))}
        </div>
      </div>
      <div className="w-[32%] min-w-[340px] pt-16">
        <div className="flex flex-col px-6 py-9 border border-xgray300 rounded-[8px] gap-4">
          <InputForm
            label="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름을 입력해주세요."
          />
          <InputForm
            label="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Example@gmail.com"
          />
          <InputForm
            label="전화번호"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010-1234-5678"
          />
          <button
            onClick={onApply}
            className="hover:opacity-90 mt-8 cursor-pointer text-white bg-brightnavy w-full h-[38px] px-3 py-2 rounded-[6px] text-[14px] font-medium leading-5"
          >
            지원하기
          </button>
        </div>
      </div>
    </main>
  );
};

export default Role;

const InputForm = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
}) => {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[14px] font-medium">{label}</div>
      <input
        placeholder={placeholder}
        className="w-full h-[36px] px-3 py-2 border border-xgray400 rounded-[5px] text-[13px] font-light leading-5 focus:ring-1 focus:ring-brightnavy outline-none"
        value={value}
        onChange={onChange}
      />
    </div>
  );
};

const Texts = [
  {
    title: "역할 소개",
    description: `Model을 직접 serving해야하는 서비스가 많아지면서, Machine learning piepeline 설계 역량에 대한 요구가 갈수록 증가하고 있습니다. 이 역할은 Machine Learning Pipeline Engineer 역량을 필요로 합니다.
  아래의 역량/경험들 중 하나 이상에 해당한다면, 편하게 지원해주세요.
  
  - 대규모 모델 학습 및 추론을 위한 데이터 파이프라인을 설계·구현한 경험이 있으신 분
  - ML 모델을 실제 서비스 환경에 **배포(Serving)**하고, 성능 모니터링 및 최적화를 수행해본 경험이 있으신 분
  - 분산 학습, GPU 스케줄링, MLOps 환경(Airflow, Kubeflow, MLflow 등)을 구축하고 운영할 수 있습니다.
  - 모델 개발부터 운영까지 엔드투엔드 ML 시스템을 주도적으로 설계하고 개선할 수 있습니다.`,
  },
  {
    title: "자격 요건",
    description: `Model을 직접 serving해야하는 서비스가 많아지면서, Machine learning piepeline 설계 역량에 대한 요구가 갈수록 증가하고 있습니다. 이 역할은 Machine Learning Pipeline Engineer 역량을 필요로 합니다.
아래의 역량/경험들 중 하나 이상에 해당한다면, 편하게 지원해주세요.

- 대규모 모델 학습 및 추론을 위한 데이터 파이프라인을 설계·구현한 경험이 있으신 분
- ML 모델을 실제 서비스 환경에 **배포(Serving)**하고, 성능 모니터링 및 최적화를 수행해본 경험이 있으신 분
- 분산 학습, GPU 스케줄링, MLOps 환경(Airflow, Kubeflow, MLflow 등)을 구축하고 운영할 수 있습니다.
- 모델 개발부터 운영까지 엔드투엔드 ML 시스템을 주도적으로 설계하고 개선할 수 있습니다.
`,
  },
  {
    title: "우대 요건",
    description: `Model을 직접 serving해야하는 서비스가 많아지면서, Machine learning piepeline 설계 역량에 대한 요구가 갈수록 증가하고 있습니다. 이 역할은 Machine Learning Pipeline Engineer 역량을 필요로 합니다.
아래의 역량/경험들 중 하나 이상에 해당한다면, 편하게 지원해주세요.

- 대규모 모델 학습 및 추론을 위한 데이터 파이프라인을 설계·구현한 경험이 있으신 분
- ML 모델을 실제 서비스 환경에 **배포(Serving)**하고, 성능 모니터링 및 최적화를 수행해본 경험이 있으신 분
- 분산 학습, GPU 스케줄링, MLOps 환경(Airflow, Kubeflow, MLflow 등)을 구축하고 운영할 수 있습니다.
- 모델 개발부터 운영까지 엔드투엔드 ML 시스템을 주도적으로 설계하고 개선할 수 있습니다.`,
  },
  {
    title: "진행 방법",
    description: `이력서 제출, AI Interview를 완료하면 현재 역량을 필요로 하는 팀들이 확인할 수 있게 됩니다.
우선 등록이 되면 제안을 기다리기만 하면 되고, 회사에게서 제안을 받으면 수락/거절을 통해 해당 회사의 다음 채용 프로세스로 진행할 수 있습니다.
1차 인터뷰를 거쳤기 때문에 바로 2차 채용 프로세스 혹은 최종 프로세스부터 시작하게 됩니다.
`,
  },
];
