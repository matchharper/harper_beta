import {preflightCasesV3} from './preflight-cases-v3.js';
// v3 was never model-tested. Public GET already showed its DoorDash URL redirecting
// to an error list, so freeze a new input version before any job-agent execution.
const {doordash,...remaining}=preflightCasesV3;
export const preflightCasesV4={...remaining,affirm:{site:'Greenhouse',company:'Affirm',title:'Staff Software Engineer, Backend (Search)',url:'https://job-boards.greenhouse.io/affirm/jobs/8005406003'}};
