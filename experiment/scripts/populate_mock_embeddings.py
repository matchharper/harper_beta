import psycopg2
import numpy as np

def populate_mock_embeddings():
    conn = psycopg2.connect(
        host="localhost",
        database="harper",
        user="postgres",
        password="postgres",
        port="5432"
    )
    cur = conn.cursor()

    print("Fetching candidate IDs...")
    cur.execute("SELECT id FROM public.candid")
    rows = cur.fetchall()
    
    print(f"Generating mock embeddings for {len(rows)} candidates...")
    
    # 1536-dimensional random vectors
    # We'll use a small batch size for updates
    batch_size = 100
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        for candidate_id_tuple in batch:
            candidate_id = candidate_id_tuple[0]
            # Generate a normalized random vector (better for cosine similarity tests)
            vec = np.random.rand(1536).astype(np.float32)
            vec = vec / np.linalg.norm(vec)
            vec_str = "[" + ",".join(map(str, vec.tolist())) + "]"
            
            cur.execute(
                "UPDATE public.candid SET embedding = %s WHERE id = %s",
                (vec_str, candidate_id)
            )
        conn.commit()
        if (i + batch_size) % 1000 == 0:
            print(f"Processed {i + batch_size} candidates...")

    print("Updating statistics...")
    cur.execute("ANALYZE public.candid")
    conn.commit()
    
    cur.close()
    conn.close()
    print("Mockup embeddings populated successfully.")

if __name__ == "__main__":
    populate_mock_embeddings()
