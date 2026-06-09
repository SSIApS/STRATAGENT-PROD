"""
STRATAGENT - Pre-Restart Safety Check
Run before every backend restart:
  cd stratagent/backend && python check_before_restart.py

Checks:
  1. No risky non-ASCII in agent/router docstrings (causes Windows CIFS tokenizer failures)
  2. All .py files have valid syntax
  3. All router files are registered in main.py

ALLOWLISTED files have intentional non-ASCII (box chars, degree signs, Danish letters)
in string literals used for actual output -- these are working and must not be cleaned.

Exit 0 = safe to restart. Exit 1 = fix errors first.
"""
import ast, os, sys

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

# Files with INTENTIONAL non-ASCII in string output content -- do not flag
ALLOWLIST = {
    'services/docx_export.py',        # box chars for Word table borders
    'routers/output_engine.py',        # box chars, bullets for docx
    'routers/stratalink.py',           # box chars for report formatting
    'routers/knowledge_base.py',       # box chars for image section dividers
    'agents/supplier_report_agent.py', # box chars for report sections
    'agents/extraction_agent.py',      # degree signs, x in product specs; [!] flags
    'agents/research_agent.py',        # Danish letters (entreprenorvirksomhed etc)
    'config.py',                       # box chars for env var table display
    'stratalyst_config.py',            # box chars for config display
}

py_files = []
for root, dirs, files in os.walk(BACKEND_DIR):
    dirs[:] = [d for d in dirs if d not in ('venv', '__pycache__', '.git')]
    for f in files:
        if f.endswith('.py'):
            py_files.append(os.path.join(root, f))
py_files.sort()

print(f"STRATAGENT pre-restart check -- {len(py_files)} files\n")

ERRORS = []

for path in py_files:
    rel = os.path.relpath(path, BACKEND_DIR)

    try:
        with open(path, encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        ERRORS.append(f"  CANNOT READ  {rel}: {e}")
        continue

    # Syntax check -- all files
    try:
        ast.parse(content)
    except SyntaxError as e:
        ERRORS.append(f"  SYNTAX ERR   {rel}  line {e.lineno}: {e.msg}")
        continue

    # Non-ASCII check -- skip allowlisted files
    if rel in ALLOWLIST:
        continue

    bad = []
    for i, line in enumerate(content.splitlines(), 1):
        chars = [c for c in line if ord(c) > 127]
        if chars:
            bad.append((i, chars))
    if bad:
        ERRORS.append(f"  NON-ASCII    {rel}")
        for lineno, chars in bad[:4]:
            ERRORS.append(f"               line {lineno}: {[hex(ord(c)) for c in set(chars)]}")
        if len(bad) > 4:
            ERRORS.append(f"               ... and {len(bad)-4} more lines")
        ERRORS.append(f"  FIX: python3 -c \"open('{rel}','w').write(open('{rel}').read()"
                      f".replace('\\u2014','--').replace('\\u2013','-').replace('\\u2192','->'))\"")

# Router registration check
print("Router registration:")
main_content = open(os.path.join(BACKEND_DIR, 'main.py'), encoding='utf-8').read()
routers_dir  = os.path.join(BACKEND_DIR, 'routers')
for r in sorted(f[:-3] for f in os.listdir(routers_dir) if f.endswith('.py') and not f.startswith('_')):
    status = "OK " if r in main_content else "MISSING"
    if status == "MISSING":
        ERRORS.append(f"  ROUTER NOT REGISTERED: routers/{r}.py")
    print(f"  {status}  {r}")

print()
if ERRORS:
    print(f"{'='*50}")
    print("ERRORS -- do NOT restart yet:")
    for e in ERRORS:
        print(e)
    print(f"{'='*50}")
    sys.exit(1)
else:
    print("All clean -- safe to restart.")
    sys.exit(0)
