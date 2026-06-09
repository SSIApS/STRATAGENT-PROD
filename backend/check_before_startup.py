"""
STRATAGENT - Pre-Startup / Pre-Restart Watchdog
Run before every backend start or restart:
  cd stratagent/backend && python check_before_startup.py

Extends check_before_restart.py with checks for bug classes that have
repeatedly broken this backend (see memory: known_issues.md):

  1.  Syntax validity (ast.parse) -- all .py files
  2.  Non-ASCII in docstrings/comments (Windows CIFS tokenizer failure)
  3.  Router registration in main.py
  4.  Router prefix collisions (the "strat*" overlap hypothesis from the
      STRATAGORA 404 saga)
  5.  Undefined helper-function references (the _threshold_label /
      _check_monitored_positions NameError class of bug)
  6.  Import resolution -- actually imports every router/agent/service
      module with THIS interpreter (catches Windows-only import failures
      that ast.parse cannot see, e.g. missing imports, tokenizer issues)
  7.  Direct Gemini .generate_content() calls outside services/gemini.py
      (event-loop-blocking class of bug -- should route through
      asyncio.to_thread)
  8.  f-string double-brace dict literals, e.g. f"...{{'k': v}}..."
      (TypeError: unhashable dict -- only triggers when data is non-empty,
      so it hides in testing)
  9.  Firestore .where() + .order_by() on the same query chain
      (composite index / FailedPrecondition -- surfaces as a 500)
  10. Required environment variables / secrets present
  11. Target port free before uvicorn tries to bind it
  12. Recently-modified-files summary (CIFS mtime sanity check -- helps
      confirm Claude's edits actually landed before you trust a restart)

Exit 0 = safe to start/restart. Exit 1 = fix errors first.
"""
import ast
import importlib
import os
import re
import socket
import sys
import time

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND_DIR)

# -- Configuration ----------------------------------------------------------------

PORT = int(os.getenv("STRATAGENT_PORT", "9000"))

# Each tuple is a group of env var names where ANY ONE present satisfies the check
REQUIRED_ENV_VAR_GROUPS = [
    ("STRATAGENT_GEMINI_API_KEY", "GOOGLE_API_KEY"),
]

# Files with INTENTIONAL non-ASCII in string OUTPUT content -- do not flag.
# (box-drawing chars for docx tables, degree signs, Danish letters in prompts)
ALLOWLIST = {
    'services/docx_export.py',
    'routers/output_engine.py',
    'routers/stratalink.py',
    'routers/knowledge_base.py',
    'agents/supplier_report_agent.py',
    'agents/extraction_agent.py',
    'agents/research_agent.py',
    'config.py',
    'stratalyst_config.py',
}

# Directories whose modules should import cleanly under this interpreter
IMPORT_CHECK_DIRS = ['routers', 'agents', 'services']

ERRORS = []
WARNINGS = []


def rel(path):
    return os.path.relpath(path, BACKEND_DIR).replace('\\', '/')


# -- Collect .py files -------------------------------------------------------------

py_files = []
for root, dirs, files in os.walk(BACKEND_DIR):
    dirs[:] = [d for d in dirs if d not in ('venv', '__pycache__', '.git', 'node_modules')]
    for f in files:
        if f.endswith('.py'):
            py_files.append(os.path.join(root, f))
py_files.sort()

print(f"STRATAGENT pre-startup watchdog -- {len(py_files)} files\n")

parsed = {}  # rel_path -> (content, ast_tree)

# -- 1 + 2: Syntax + non-ASCII -----------------------------------------------------

for path in py_files:
    r = rel(path)
    try:
        with open(path, encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        ERRORS.append(f"  CANNOT READ    {r}: {e}")
        continue

    try:
        tree = ast.parse(content)
    except SyntaxError as e:
        ERRORS.append(f"  SYNTAX ERR     {r}  line {e.lineno}: {e.msg}")
        continue

    parsed[r] = (content, tree)

    if r in ALLOWLIST:
        continue

    bad = [(i, [c for c in line if ord(c) > 127])
           for i, line in enumerate(content.splitlines(), 1)
           if any(ord(c) > 127 for c in line)]
    if bad:
        ERRORS.append(f"  NON-ASCII      {r}")
        for lineno, chars in bad[:4]:
            ERRORS.append(f"                 line {lineno}: {[hex(ord(c)) for c in set(chars)]}")
        if len(bad) > 4:
            ERRORS.append(f"                 ... and {len(bad) - 4} more lines")


# -- 3 + 4: Router registration + prefix collisions --------------------------------

print("Router registration:")
main_path = os.path.join(BACKEND_DIR, 'main.py')
main_content = open(main_path, encoding='utf-8').read()
routers_dir = os.path.join(BACKEND_DIR, 'routers')
router_names = sorted(f[:-3] for f in os.listdir(routers_dir)
                      if f.endswith('.py') and not f.startswith('_'))
for r in router_names:
    status = "OK " if r in main_content else "MISSING"
    if status == "MISSING":
        ERRORS.append(f"  ROUTER NOT REGISTERED: routers/{r}.py")
    print(f"  {status}  {r}")

prefixes = re.findall(r'prefix\s*=\s*["\']([^"\']+)["\']', main_content)
seen = {}
for p in prefixes:
    seen[p] = seen.get(p, 0) + 1
dupes = [p for p, n in seen.items() if n > 1]
if dupes:
    ERRORS.append(f"  DUPLICATE ROUTER PREFIX(ES): {dupes}")
for i, p1 in enumerate(prefixes):
    for p2 in prefixes[i + 1:]:
        if p1 != p2 and (p2.startswith(p1 + "/") or p1.startswith(p2 + "/")):
            WARNINGS.append(f"  PREFIX OVERLAP: '{p1}' and '{p2}' -- one nests inside the other")
print()


# -- 5: Undefined helper-function references ---------------------------------------
# Heuristic tuned to this codebase's recurring bug: a "_private_helper(...)" is
# called somewhere in a module but never defined, assigned, or imported anywhere
# in that same module (the _threshold_label / _check_monitored_positions class
# of NameError that crashed the Knowledge Base router).

print("Undefined-helper check (private names referenced but never defined/imported):")
undefined_found = False
for r, (content, tree) in parsed.items():
    defined = set()
    referenced = {}  # name -> first line number seen

    class Collector(ast.NodeVisitor):
        def visit_FunctionDef(self, node):
            defined.add(node.name)
            self.generic_visit(node)

        def visit_AsyncFunctionDef(self, node):
            defined.add(node.name)
            self.generic_visit(node)

        def visit_ClassDef(self, node):
            defined.add(node.name)
            self.generic_visit(node)

        def visit_Import(self, node):
            for alias in node.names:
                defined.add((alias.asname or alias.name).split('.')[0])

        def visit_ImportFrom(self, node):
            for alias in node.names:
                defined.add(alias.asname or alias.name)

        def visit_arg(self, node):
            defined.add(node.arg)
            self.generic_visit(node)

        def visit_Name(self, node):
            if node.id.startswith('_') and not node.id.startswith('__'):
                if isinstance(node.ctx, ast.Load):
                    referenced.setdefault(node.id, getattr(node, 'lineno', 0))
                else:
                    defined.add(node.id)
            elif not isinstance(node.ctx, ast.Load):
                defined.add(node.id)

    Collector().visit(tree)

    missing = sorted(referenced.items(), key=lambda kv: kv[1])
    missing = [(n, ln) for n, ln in missing if n not in defined]
    if missing:
        undefined_found = True
        for name, lineno in missing:
            ERRORS.append(f"  UNDEFINED NAME  {r}:{lineno}: '{name}' is called/used but never "
                          f"defined, assigned, or imported in this file")
print("  clean" if not undefined_found else "  see ERRORS below")
print()


# -- 6: Import resolution (real import with this interpreter) ----------------------

print("Import resolution (live import test with this interpreter):")
import_failures = 0
for d in IMPORT_CHECK_DIRS:
    dir_path = os.path.join(BACKEND_DIR, d)
    if not os.path.isdir(dir_path):
        continue
    for f in sorted(os.listdir(dir_path)):
        if not f.endswith('.py') or f.startswith('_'):
            continue
        mod_name = f"{d}.{f[:-3]}"
        try:
            importlib.import_module(mod_name)
        except Exception as e:
            import_failures += 1
            ERRORS.append(f"  IMPORT FAIL     {mod_name}: {type(e).__name__}: {e}")
print(f"  {len(IMPORT_CHECK_DIRS)} dirs scanned, {import_failures} import failure(s)"
      if import_failures else "  all modules import cleanly")
print()


# -- 7: Direct Gemini calls outside services/gemini.py -----------------------------

print("Blocking-call check (direct .generate_content() outside services/gemini.py):")
SYNC_CALL_RE = re.compile(r'\.generate_content\s*\(')
blocking_found = False
for r, (content, _tree) in parsed.items():
    if r.endswith('services/gemini.py'):
        continue
    for i, line in enumerate(content.splitlines(), 1):
        if SYNC_CALL_RE.search(line):
            blocking_found = True
            WARNINGS.append(f"  DIRECT GEMINI CALL  {r}:{i}: {line.strip()[:90]}"
                            f" -- route through services/gemini.py (asyncio.to_thread)")
print("  none found outside services/gemini.py" if not blocking_found else "  see WARNINGS below")
print()


# -- 8: f-string double-brace dict literal -----------------------------------------

print("f-string double-brace check (f\"...{{'k': v}}...\" parses as a set, not a dict):")
FSTRING_BRACE_RE = re.compile(r'f["\'][^"\']*\{\{[^{}]*:[^{}]*\}\}')
brace_found = False
for r, (content, _tree) in parsed.items():
    for i, line in enumerate(content.splitlines(), 1):
        if FSTRING_BRACE_RE.search(line):
            brace_found = True
            ERRORS.append(f"  F-STRING {{DICT}}  {r}:{i}: {line.strip()[:90]}"
                          f" -- pre-compute the dict/list outside the f-string")
print("  none found" if not brace_found else "  see ERRORS below")
print()


# -- 9: Firestore .where() + .order_by() in the same chain -------------------------

print("Firestore where()+order_by() check (needs composite index -- sort in Python instead):")
fs_found = False
for r, (content, _tree) in parsed.items():
    for m in re.finditer(r'\.where\(', content):
        window = content[m.start():m.start() + 350]
        if '.order_by(' in window and '.stream()' in window:
            line_no = content[:m.start()].count('\n') + 1
            fs_found = True
            ERRORS.append(f"  WHERE + ORDER_BY  {r}:~{line_no} -- filter in Firestore,"
                          f" sort in Python (verify it's one chain, not two queries)")
            break
print("  none found" if not fs_found else "  see ERRORS below")
print()


# -- 10: Required environment variables / secrets ----------------------------------

print("Environment / secrets check:")
env_path = os.path.join(BACKEND_DIR, '.env')
env_from_file = {}
if os.path.exists(env_path):
    for line in open(env_path, encoding='utf-8'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, _, v = line.partition('=')
            env_from_file[k.strip()] = v.strip()

for group in REQUIRED_ENV_VAR_GROUPS:
    present = any(os.getenv(name) or env_from_file.get(name) for name in group)
    label = " or ".join(group)
    if present:
        print(f"  OK       {label}")
    else:
        ERRORS.append(f"  MISSING ENV VAR: {label} (set in backend/.env or the environment)")
        print(f"  MISSING  {label}")
print()


# -- 11: Port availability ----------------------------------------------------------

print(f"Port {PORT} availability:")
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(1)
try:
    in_use = sock.connect_ex(('127.0.0.1', PORT)) == 0
finally:
    sock.close()
if in_use:
    ERRORS.append(f"  PORT {PORT} ALREADY IN USE -- find and stop the process first"
                  f" (netstat -ano | findstr :{PORT})")
    print(f"  IN USE -- stop the existing process before starting uvicorn")
else:
    print(f"  free")
print()


# -- 12: Recently modified files (CIFS mtime sanity) --------------------------------

print("Recently modified files (do these match your last edit session? set STRATAGENT_PORT to override port):")
key_files = [p for p in py_files
             if rel(p).split('/')[0] in ('routers', 'agents', 'services') or rel(p) == 'main.py']
key_files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
for p in key_files[:8]:
    mtime = time.strftime('%Y-%m-%d %H:%M', time.localtime(os.path.getmtime(p)))
    print(f"  {mtime}   {rel(p)}")
print()


# -- Summary -------------------------------------------------------------------------

if WARNINGS:
    print('-' * 60)
    print("WARNINGS -- review, not blocking:")
    for w in WARNINGS:
        print(w)
    print()

if ERRORS:
    print('=' * 60)
    print("ERRORS -- do NOT start/restart yet:")
    for e in ERRORS:
        print(e)
    print('=' * 60)
    sys.exit(1)
else:
    print('=' * 60)
    print("All clean -- safe to start/restart.")
    print('=' * 60)
    sys.exit(0)
