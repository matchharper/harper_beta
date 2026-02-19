import os
import psycopg2
from psycopg2.extras import execute_values
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables from harper_beta/.env.local
load_dotenv(dotenv_path='/Users/kimdain/Workspace/harper_beta/.env.local')

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        database=os.getenv("DB_NAME", "harper"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "postgres"),
        port=os.getenv("DB_PORT", "5432")
    )

def update_embeddings():
    conn = get_db_connection()
    cur = conn.cursor()

    print("Fetching IDs of candidates without embeddings...")
    cur.execute("SELECT id FROM public.candid WHERE embedding IS NULL")
    all_ids = [row[0] for row in cur.fetchall()]
    total_count = len(all_ids)
    print(f"Total candidates to process: {total_count}")

    # OpenAI Batch Size: 100 texts per API call (Reverted to 100 due to token limits)
    api_batch_size = 100 
    
    for start_idx in range(0, total_count, api_batch_size):
        batch_ids = all_ids[start_idx : start_idx + api_batch_size]
        
        print(f"\n--- Processing {start_idx} to {start_idx + len(batch_ids)} / {total_count} ---")
        
        query = """
        WITH candidate_basic AS (
            SELECT id, COALESCE(name, '') || ' | ' || COALESCE(headline, '') || ' | ' || COALESCE(summary, '') || ' | ' || COALESCE(bio, '') as basic_info
            FROM public.candid WHERE id = ANY(%s::uuid[])
        ),
        candidate_experience AS (
            SELECT eu.candid_id, STRING_AGG(COALESCE(eu.role, '') || ' at ' || COALESCE(c.name, '') || ': ' || COALESCE(eu.description, ''), ' ; ') as experience_info
            FROM public.experience_user eu LEFT JOIN public.company_db c ON eu.company_id = c.id
            WHERE eu.candid_id = ANY(%s::uuid[]) GROUP BY eu.candid_id
        ),
        candidate_education AS (
            SELECT candid_id, STRING_AGG(COALESCE(school, '') || ' (' || COALESCE(degree, '') || ' in ' || COALESCE(field, '') || ')', ' ; ') as education_info
            FROM public.edu_user WHERE candid_id = ANY(%s::uuid[]) GROUP BY candid_id
        ),
        candidate_publications AS (
            SELECT candid_id, STRING_AGG(COALESCE(title, '') || ' (' || COALESCE(published_at, '') || ')', ' ; ') as publication_info
            FROM public.publications WHERE candid_id = ANY(%s::uuid[]) GROUP BY candid_id
        ),
        candidate_extra AS (
            SELECT candid_id, STRING_AGG(COALESCE(title, '') || ': ' || COALESCE(description, ''), ' ; ') as extra_info
            FROM public.extra_experience WHERE candid_id = ANY(%s::uuid[]) GROUP BY candid_id
        )
        SELECT b.id, 'BASIC: ' || b.basic_info || ' || EXPERIENCE: ' || COALESCE(e.experience_info, 'N/A') || ' || EDUCATION: ' || COALESCE(ed.education_info, 'N/A') || ' || PUBLICATIONS: ' || COALESCE(p.publication_info, 'N/A') || ' || AWARDS/EXTRA: ' || COALESCE(ex.extra_info, 'N/A') as full_profile_text
        FROM candidate_basic b
        LEFT JOIN candidate_experience e ON b.id = e.candid_id
        LEFT JOIN candidate_education ed ON b.id = ed.candid_id
        LEFT JOIN candidate_publications p ON b.id = p.candid_id
        LEFT JOIN candidate_extra ex ON b.id = ex.candid_id;
        """
        
        try:
            cur.execute(query, (batch_ids, batch_ids, batch_ids, batch_ids, batch_ids))
            rows = cur.fetchall()
            
            if not rows: continue

            ids_in_batch = [row[0] for row in rows]
            texts_in_batch = [row[1][:8000] for row in rows]

            # 3. Call OpenAI Embedding API in BATCH
            response = client.embeddings.create(
                model="text-embedding-3-small",
                input=texts_in_batch
            )
            
            # Prepare data for batch update
            update_data = []
            for idx, data in enumerate(response.data):
                update_data.append((data.embedding, ids_in_batch[idx]))

            # 4. Batch Update using execute_values
            # This is much faster than individual UPDATE statements
            update_query = """
                UPDATE public.candid AS t
                SET embedding = CAST(v.embedding AS vector)
                FROM (VALUES %s) AS v(embedding, id)
                WHERE t.id = CAST(v.id AS uuid)
            """
            execute_values(cur, update_query, update_data)
            
            conn.commit()
            print(f"Batch success. Progress: {min(start_idx + api_batch_size, total_count)}/{total_count}")

        except Exception as e:
            conn.rollback()
            print(f"Error in batch: {e}")
            continue

    cur.close()
    conn.close()
    print("\nUpdate complete.")

if __name__ == "__main__":
    update_embeddings()