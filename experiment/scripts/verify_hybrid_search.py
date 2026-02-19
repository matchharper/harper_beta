import os
import psycopg2
import time
from openai import OpenAI
from dotenv import load_dotenv
import json

# Load environment variables
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

def run_hybrid_search(query_text, hard_filters="TRUE", semantic_query=None):
    if not semantic_query:
        semantic_query = query_text
        
    print(f"\n[Testing Query]: {query_text}")
    
    # 1. Generate Embedding
    start_time = time.time()
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=semantic_query
    )
    embedding = response.data[0].embedding
    vector_str = f"[{','.join(map(str, embedding))}]"
    embed_time = time.time() - start_time
    
    # 2. Execute Hybrid SQL
    conn = get_db_connection()
    cur = conn.cursor()
    
    # We use a simplified version of our production SQL for verification
    sql = f"""
    WITH semantic_scores AS (
      SELECT id, 1 - (embedding <=> '{vector_str}') AS similarity_score
      FROM candid
      WHERE embedding IS NOT NULL
    )
    SELECT 
      T1.id, T1.name, T1.headline, T1.location,
      COALESCE(s.similarity_score, 0) as score
    FROM candid T1
    LEFT JOIN semantic_scores s ON T1.id = s.id
    WHERE {hard_filters}
    ORDER BY score DESC
    LIMIT 5;
    """
    
    search_start = time.time()
    cur.execute(sql)
    results = cur.fetchall()
    search_time = time.time() - search_start
    
    print(f"  - Embedding Time: {embed_time:.3f}s")
    print(f"  - DB Search Time: {search_time:.3f}s")
    print(f"  - Total Latency: {embed_time + search_time:.3f}s")
    print("\n  [Top Results]:")
    for i, res in enumerate(results):
        print(f"    {i+1}. {res[1]} | {res[2]} | {res[3]} (Score: {res[4]:.4f})")
    
    cur.close()
    conn.close()

if __name__ == "__main__":
    # Test T1: Semantic Expansion
    run_hybrid_search("생성형 AI 모델 최적화 경험이 있는 엔지니어")
    
    # Test T2: Hard Filters + Semantic
    run_hybrid_search(
        "서울 거주 5년 이상 경력의 백엔드 개발자", 
        hard_filters="location ILIKE '%서울%' AND total_exp_months >= 60"
    )

