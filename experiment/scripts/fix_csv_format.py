import pandas as pd
import ast
import json
import os
import sys

DATA_DIR = 'database/data'

def fix_postgres_array(val):
    if pd.isna(val) or val == '' or val == '[]':
        return None  # Will become empty string in CSV -> NULL in DB
    try:
        # Evaluate Python list string "['a', 'b']"
        lst = ast.literal_eval(val)
        if not isinstance(lst, list):
            return None
        if not lst:
            return None # Empty array or NULL? Postgres {} is empty array. Let's use NULL for empty to be safe, or '{}'.
        
        # Escape double quotes in elements if necessary
        # Postgres array format: {"val1", "val2"}
        # We need to escape double quotes inside value with backslash or double double-quotes?
        # CSV format usually handles the outer quoting. The inner string for array:
        # { "a", "b" }
        formatted_items = []
        for item in lst:
            # simple replacement of " with \" might be needed if inside the array string
            # But standard COPY CSV format: 
            # If the field is: { "a", "b" }
            # CSV file should look like: "{ ""a"", ""b"" }" (if quoted)
            # Let's just create the string: {"a","b"}
            # And let pandas handle the CSV escaping.
            clean_item = str(item).replace('"', '\"') # Escape quotes for the array literal
            formatted_items.append(f'"{clean_item}"')
        
        return '{' + ','.join(formatted_items) + '}'
    except:
        return None

def fix_json(val):
    if pd.isna(val) or val == '' or val == '{}':
        return None
    try:
        # Evaluate Python dict string "{'a': 1}"
        d = ast.literal_eval(val)
        if isinstance(d, dict):
            return json.dumps(d) # Returns '{"a": 1}' (valid JSON)
        return None
    except:
        return None

def process_candid():
    fp = os.path.join(DATA_DIR, 'candid.csv')
    if not os.path.exists(fp):
        print(f"File not found: {fp}")
        return

    print(f"Processing {fp}...")
    df = pd.read_csv(fp)

    # 1. links: ['url'] -> {"url"}
    if 'links' in df.columns:
        df['links'] = df['links'].apply(fix_postgres_array)
    
    # 2. email: [] -> NULL
    if 'email' in df.columns:
        # If it looks like a list '[]', kill it. If it's a string, keep it.
        def clean_email(x):
            if str(x) == '[]': return None
            return x
        df['email'] = df['email'].apply(clean_email)

    # 3. fts: "name: ..." -> NULL
    if 'fts' in df.columns:
        df['fts'] = None

    # 4. total_exp_months: Ensure integer formatting (no 0.0)
    if 'total_exp_months' in df.columns:
        df['total_exp_months'] = df['total_exp_months'].astype('Int64')

    # Write back
    df.to_csv(fp, index=False, na_rep='', quoting=1)
    print(f"Finished {fp}")

def process_company():
    fp = os.path.join(DATA_DIR, 'company_db.csv')
    if not os.path.exists(fp):
        return

    print(f"Processing {fp}...")
    df = pd.read_csv(fp)

    # 1. employee_count_range (jsonb)
    if 'employee_count_range' in df.columns:
        df['employee_count_range'] = df['employee_count_range'].apply(fix_json)

    # 2. funding (jsonb)
    if 'funding' in df.columns:
        df['funding'] = df['funding'].apply(fix_json)

    # 3. related_links (text[])
    if 'related_links' in df.columns:
        df['related_links'] = df['related_links'].apply(fix_postgres_array)

    # 4. founded_year: Ensure integer formatting
    if 'founded_year' in df.columns:
        df['founded_year'] = df['founded_year'].astype('Int64')

    df.to_csv(fp, index=False, na_rep='')
    print(f"Finished {fp}")

def main():
    try:
        process_candid()
        process_company()
        print("CSV processing complete.")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
