# Harper for Slack — privacy notice draft

**Internal publication draft. Not an active privacy policy. Do not submit its URL or describe the safeguards below as implemented before the release gates are satisfied.** This supplements the company service policy; it does not amend the Career policy or establish a new lawful basis by itself.

## Draft factual text — English

### What the connection does

When your company connects Harper to Slack, Harper uses Slack workspace and channel identifiers and bot authorization credentials to operate the connection. Harper uses Slack user information, including email addresses when available under the granted permissions, to identify company accounts and check access to Harper features.

Harper processes mentions and relevant thread content in connected channels to answer recruiting requests. This may include job requirements, candidate discussions and content from files supplied in those conversations. Supported Harper links may display candidate previews. Relevant conversations and extracted file content may be stored in the company’s Harper conversation records, and content needed to generate a response may be processed by third-party AI services.

### Sharing and recruiting decisions

Candidate information and Harper replies may be visible to people who can read the selected Slack channel. Choose a channel limited to the team members involved in hiring and share only the information necessary for that purpose. Do not include government identification numbers, financial account details, health information or unrelated sensitive information.

A suggested candidate has not necessarily expressed interest in the company. A candidate who is ready to connect has accepted the Role and is waiting for the company’s decision. AI responses, summaries and recommendations may contain errors or omissions. Team members remain responsible for interviews and hiring decisions.

### Disconnecting and privacy requests

Disconnecting Slack or uninstalling Harper disables the relevant connection; it does not automatically erase existing Harper company conversations and records. To request access to, correction of, transfer of or deletion of your personal data, email chris@matchharper.com. You do not need to log in to contact us. We may need information sufficient to verify your identity and authority; do not send passwords, authorization tokens or unnecessary personal data with your request.

## 같은 고지의 한국어 초안

### 연결 시 처리하는 정보

회사가 Harper를 Slack에 연결하면 워크스페이스·채널 식별 정보와 봇 인증 정보를 이용해 연결을 운영합니다. 허용된 권한 범위에서 Slack 사용자 정보와 이메일을 이용해 회사 계정을 식별하고 Harper 기능에 대한 접근 권한을 확인합니다.

Harper는 연결된 채널의 멘션과 관련 스레드를 처리해 채용 요청에 답변합니다. 채용 요건, 후보자에 관한 대화, 해당 대화에 제공한 파일에서 읽은 내용이 포함될 수 있습니다. 지원하는 Harper 링크에는 후보자 미리보기가 표시될 수 있습니다. 관련 대화와 파일에서 읽은 내용은 회사의 Harper 대화 기록에 저장될 수 있으며, 답변 생성에 필요한 내용은 외부 AI 처리 서비스로 전달될 수 있습니다.

### 공유 범위와 채용 결정

선택한 Slack 채널을 볼 수 있는 사람에게 후보자 정보와 Harper의 답변이 표시될 수 있습니다. 채용에 참여하는 팀원만 있는 채널을 선택하고 필요한 정보만 공유해 주세요. 주민등록번호, 금융 계정 정보, 건강 정보 등 채용 대화에 불필요한 민감한 정보는 포함하지 마세요.

먼저 제안 가능한 후보는 아직 회사에 대한 관심이 확인된 상태가 아닙니다. 연결 대기 후보는 Role을 수락하고 회사의 결정을 기다리는 상태입니다. AI 답변·요약·추천에는 오류나 누락이 있을 수 있으며, 인터뷰와 채용 결정은 팀원이 직접 내립니다.

### 연결 해제와 개인정보 요청

Slack 연결을 해제하거나 Harper 앱을 제거하면 해당 연결은 중단되지만, 기존 Harper 회사 대화와 기록이 자동으로 모두 삭제되지는 않습니다. 개인정보 열람·정정·이동·삭제는 로그인 없이 chris@matchharper.com으로 요청할 수 있습니다. 본인 및 요청 권한을 확인하는 데 필요한 정보를 요청할 수 있으며, 문의에 비밀번호·인증 토큰·불필요한 개인정보를 포함하지 마세요.

## Publication gate — complete these sections with verified facts

| Required section | Prepared decision / evidence needed |
| --- | --- |
| Controller and scope | Confirm the legal entity, address, responsible privacy contact, company service terms and relationship to the existing Career notice. Do not copy Jill’s UK controller/legal basis. |
| Slack access boundaries | Implement and test source-channel authorization for original content, previews, summaries, search and model output before promising Slack-equivalent access. Explain any remaining limitation accurately. |
| Retention | State actual periods or objective deletion criteria separately for content, extracted files, summaries, authorization credentials, jobs, logs and backups. Current 24-hour context/queue values do not cover the whole system. |
| Source corrections/deletions | Implement and verify handling of Slack edits/deletions and access loss, including derived summaries and pending work. A deletion email process alone does not validate synchronization. |
| AI and subprocessors | List actual primary, fallback and auxiliary processors, purposes, input categories, country/region, retention and onward transfers. Confirm the production API account settings. Do not claim ZDR without approval. |
| Training and secondary use | Establish and enforce that Slack API data is excluded from model training, including fine-tuning and third-party opt-in sharing. Describe any operational diagnostics distinctly; do not use a broad service-improvement clause as a substitute. |
| Rights workflow | Define who handles requests, identity verification, acknowledgment/completion targets, lawful exceptions, processor requests and backup expiry. Validate a synthetic request before promising timing. |
| Support | Assign Chris as accountable support owner and confirm the operational response target required by Slack. |
| Effective date | Set only when the completed, reviewed notice and the described behavior are live. |

Suggested operational workflow, **not yet a published commitment**: acknowledge privacy/support requests within two business days; identify the exact user/company/Slack installation; check authority without requesting credentials; locate original and derived records; fulfill or explain a specific lawful exception; record a minimal outcome and completion date. Have the responsible privacy/legal owner confirm the applicable deadlines and jurisdictional language before publication.

Review together with [the implementation gates](jill-reference-and-privacy-gates-ko.md). Merely publishing this factual draft does not satisfy Slack’s mandatory retention disclosure or resolve the implementation gaps.
