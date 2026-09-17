#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${GTM_APP_URL:=https://matchharper.com}"

topic="harper-creator-outreach-replies"
subscription="harper-creator-outreach-replies-push"
push_account="harper-outreach-push"
push_email="${push_account}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
push_endpoint="${GTM_APP_URL%/}/api/internal/contents-engine/gmail/push"

gcloud config set project "${GCP_PROJECT_ID}"
gcloud services enable gmail.googleapis.com pubsub.googleapis.com

if ! gcloud pubsub topics describe "${topic}" >/dev/null 2>&1; then
  gcloud pubsub topics create "${topic}"
fi

gcloud pubsub topics add-iam-policy-binding "${topic}" \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

if ! gcloud iam service-accounts describe "${push_email}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${push_account}" \
    --display-name="Harper creator outreach Gmail push"
fi

project_number="$(gcloud projects describe "${GCP_PROJECT_ID}" --format='value(projectNumber)')"
gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
  --member="serviceAccount:service-${project_number}@gcp-sa-pubsub.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"

if ! gcloud pubsub subscriptions describe "${subscription}" >/dev/null 2>&1; then
  gcloud pubsub subscriptions create "${subscription}" \
    --topic="${topic}" \
    --push-endpoint="${push_endpoint}" \
    --push-auth-service-account="${push_email}" \
    --push-auth-token-audience="${push_endpoint}" \
    --ack-deadline=60 \
    --min-retry-delay=10s \
    --max-retry-delay=600s
fi

cat <<EOF
GTM_OUTREACH_GMAIL_PUBSUB_TOPIC=projects/${GCP_PROJECT_ID}/topics/${topic}
GTM_OUTREACH_GMAIL_PUBSUB_SUBSCRIPTION=projects/${GCP_PROJECT_ID}/subscriptions/${subscription}
GTM_OUTREACH_GMAIL_PUBSUB_AUDIENCE=${push_endpoint}
GTM_OUTREACH_GMAIL_PUBSUB_SERVICE_ACCOUNT=${push_email}
EOF
