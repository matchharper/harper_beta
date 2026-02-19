import psycopg2
import time
import os
import argparse

def benchmark(query_file, output_file):
    conn = psycopg2.connect(
        host="localhost",
        database="harper",
        user="postgres",
        password="postgres",
        port="5432"
    )
    cur = conn.cursor()

    with open(query_file, 'r') as f:
        query = f.read()

    # Get EXPLAIN ANALYZE
    explain_query = f"EXPLAIN (ANALYZE, BUFFERS) {query}"
    
    print(f"Executing benchmark for {query_file}...")
    start_time = time.time()
    try:
        cur.execute(explain_query)
        plan = cur.fetchall()
        end_time = time.time()
        
        execution_time = end_time - start_time
        print(f"Execution successful. Time: {execution_time:.2f} seconds")

        os.makedirs('logs', exist_ok=True)
        with open(output_file, 'w') as f:
            f.write(f"Query: {query_file}\n")
            f.write(f"Execution Time: {execution_time:.2f} seconds\n")
            f.write("-" * 50 + "\n")
            for line in plan:
                f.write(line[0] + "\n")
        
        print(f"Plan saved to {output_file}")
    except Exception as e:
        print(f"Error executing query: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--query', default='database/sample_query.sql')
    parser.add_argument('--output', default='logs/baseline_plan.txt')
    args = parser.parse_args()
    
    benchmark(args.query, args.output)
