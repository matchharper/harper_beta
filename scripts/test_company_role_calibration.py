import unittest
from decimal import Decimal
import ssl
from uuid import UUID

from company_role_calibration import (
    candidate_ids_from_result,
    delivery_ssl_context,
    jsonable,
    public_display,
    role_summary_source_payload,
    role_summary_status,
    summary_input_content,
    validate_read_sql,
)


class CompanyRoleCalibrationHelperTest(unittest.TestCase):
    def test_role_summary_tracks_only_missing_language_content(self):
        status = role_summary_status({"ko": {"content": "한국어 설명"}, "en": {}})
        self.assertFalse(status["ready"])
        self.assertEqual(status["missingLanguages"], ["en"])
        self.assertEqual(
            summary_input_content({"en": {"content": "English summary"}}, "en"),
            "English summary",
        )

    def test_role_summary_source_excludes_hiring_brief_and_private_request(self):
        source = role_summary_source_payload(
            {
                "company": {
                    "brief": "Public brief",
                    "name": "Example",
                    "request": "Private company request",
                },
                "role": {
                    "description": "Public JD",
                    "hiringBrief": "Private hiring brief",
                    "information": {"secret": True},
                    "name": "Engineer",
                },
            }
        )
        serialized = str(source)
        self.assertIn("Public brief", serialized)
        self.assertIn("Public JD", serialized)
        self.assertNotIn("Private", serialized)
        self.assertNotIn("secret", serialized)

    def test_delivery_uses_a_verified_ca_context(self):
        context = delivery_ssl_context()

        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(context.check_hostname)

    def test_database_scalars_are_json_serializable(self):
        value = jsonable(
            {
                "id": UUID("00000000-0000-0000-0000-000000000001"),
                "salary": Decimal("123.45"),
            }
        )

        self.assertEqual(value["id"], "00000000-0000-0000-0000-000000000001")
        self.assertEqual(value["salary"], "123.45")

    def test_read_sql_requires_candid_limit_and_rejects_writes(self):
        self.assertEqual(
            validate_read_sql("select id from public.candid limit 20", 100),
            "select id from public.candid limit 20",
        )
        with self.assertRaisesRegex(RuntimeError, "explicit LIMIT"):
            validate_read_sql("select id from public.candid", 100)
        with self.assertRaisesRegex(RuntimeError, "write or administrative"):
            validate_read_sql(
                "with changed as (delete from public.candid returning id) select * from changed limit 20",
                100,
            )
        with self.assertRaisesRegex(RuntimeError, "talent or pipeline"):
            validate_read_sql(
                "select candid.id from public.candid join public.talent_users on true limit 20",
                100,
            )

    def test_candidate_ids_are_unique_and_preserve_retrieval_order(self):
        self.assertEqual(
            candidate_ids_from_result(
                {"rows": [{"candid_id": "one"}, {"id": "two"}, {"id": "one"}]}
            ),
            ["one", "two"],
        )

    def test_public_display_changes_only_identity_fields_and_removes_private_values(self):
        candidate = {
            "bio": "Original Name — hidden@example.net — secondary@example.net — 010-1234-5678",
            "educations": [{"school": "Example University", "field": "CS"}],
            "email": ["original@example.com", "secondary@example.net"],
            "experiences": [
                {
                    "company_name": "Example Co",
                    "description": "Original Name built the API",
                    "role": "Engineer",
                }
            ],
            "extras": [],
            "headline": "Engineer",
            "linkedin_url": "https://linkedin.com/in/original",
            "links": {"portfolio": "https://private.example/me"},
            "location": "Seoul",
            "name": "Original Name",
            "profile_picture": "https://private.example/photo.jpg",
            "summary": "See https://private.example/me",
        }

        display = public_display(candidate, 0)

        self.assertEqual(display["name"], "김민준")
        self.assertEqual(display["profilePicture"], "/images/profiles/avatar1.png")
        self.assertEqual(display["experiences"][0]["companyName"], "Example Co")
        serialized = str(display)
        self.assertNotIn("Original Name", serialized)
        self.assertNotIn("original@example.com", serialized)
        self.assertNotIn("secondary@example.net", serialized)
        self.assertNotIn("hidden@example.net", serialized)
        self.assertNotIn("010-1234-5678", serialized)
        self.assertNotIn("https://private.example/me", serialized)


if __name__ == "__main__":
    unittest.main()
