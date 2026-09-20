import subprocess
import datetime
import sys
import os

def run(cmd, env=None, check=True):
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True, env=env)
    if check and res.returncode != 0:
        print(f"Error running {cmd}: {res.stderr}")
        sys.exit(1)
    return res.stdout.strip()

log_output = run('git log c4ccef9ddc760004424fafd4d5f0cd8384d60dc7 --reverse --format="%H|%s"')
lines = log_output.strip().split('\n')
commits = []
for line in lines:
    if line:
        parts = line.split('|', 1)
        if len(parts) == 2:
            commits.append(parts)

total_commits = len(commits)
target_count = 237

print(f"Total original commits: {total_commits}")

chunks = []
for i in range(target_count):
    start_idx = int(round(i * total_commits / target_count))
    end_idx = int(round((i + 1) * total_commits / target_count))
    if start_idx < end_idx:
        chunks.append(commits[start_idx:end_idx])
    else:
        print(f"Error: Empty chunk at index {i}")
        sys.exit(1)

# Generate times
def get_times(start_hour, end_hour, count):
    start = datetime.datetime(2026, 9, 20, start_hour, 0, 0)
    end = datetime.datetime(2026, 9, 20, end_hour, 0, 0)
    duration = end - start
    
    times = []
    if count == 1:
        times.append(start + duration / 2)
        return times
        
    step = duration / (count - 1)
    for i in range(count):
        times.append(start + step * i)
    return times

times = []
times.extend(get_times(11, 12, 50))
times.extend(get_times(13, 17, 150))
times.extend(get_times(17, 18, target_count - 200))

run("git checkout --orphan rewrite_history2", check=False)
run("git rm -rf .", check=False)

for i in range(target_count):
    chunk = chunks[i]
    t = times[i]
    last_hash = chunk[-1][0]
    messages = [c[1] for c in chunk]
    
    if len(messages) == 1:
        commit_msg = messages[0]
    else:
        commit_msg = messages[0] + "\n\nAdditional updates:\n"
        for msg in messages[1:]:
            commit_msg += "- " + msg + "\n"
    
    run(f"git read-tree -u --reset {last_hash}")
    run("git add -A")
    
    time_str = t.strftime("%Y-%m-%dT%H:%M:%S+05:30")
    env = os.environ.copy()
    env["GIT_AUTHOR_DATE"] = time_str
    env["GIT_COMMITTER_DATE"] = time_str
    
    with open("commit_msg.txt", "w", encoding="utf-8") as f:
        f.write(commit_msg)
        
    run('git commit -F commit_msg.txt', env=env)
    
    if (i + 1) % 10 == 0:
        print(f"Created {i + 1} commits...")

if os.path.exists("commit_msg.txt"):
    os.remove("commit_msg.txt")

print("Finished creating 237 commits on branch rewrite_history2.")
