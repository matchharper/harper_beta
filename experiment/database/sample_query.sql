WITH candidate_ids AS (
  SELECT DISTINCT T1.id
  FROM candid AS T1
  WHERE T1.total_exp_months <= 144
    AND (
      T1.location ILIKE ANY (ARRAY['%korea%', '%seoul%', '%korean%'])
      OR EXISTS (
        SELECT 1
        FROM edu_user eu
        WHERE eu.candid_id = T1.id
          AND eu.school ILIKE ANY (ARRAY[
            '%seoul national%', '%snu%', '%서울대%', '%korea university%', '%고려대%',
            '%yonsei%', '%연세%', '%postech%', '%포항공대%', '%kaist%'
          ])
      )
    )
    AND EXISTS (
      SELECT 1
      FROM experience_user ex2
      JOIN company_db c2 ON c2.id = ex2.company_id
      WHERE ex2.candid_id = T1.id
        AND c2.name ILIKE ANY (ARRAY[
          '%naver%', '%네이버%', '%kakao%', '%카카오%', '%line%', '%라인%',
          '%coupang%', '%쿠팡%', '%baemin%', '%배달의민족%', '%delivery hero%', '%woowhan%'
        ])
        AND ex2.role ILIKE ANY (ARRAY[
          '%product manager%', '%pm%', '%product owner%', '%프로덕트 매니저%', '%프로덕트 오너%',
          '%manager%', '%매니저%', '%product%'
        ])
    )
)
SELECT DISTINCT ON (c.id)
  to_json(c.id) AS id,
  c.name,
  c.headline,
  c.location
FROM candidate_ids ci
JOIN candid c ON c.id = ci.id

ORDER BY c.id, ts_rank(c.fts, to_tsquery('english', 'product <-> manager | pm | product <-> owner')) DESC
