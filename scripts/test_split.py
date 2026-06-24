#!/usr/bin/env python3
"""测试脚本: 创建10个用户 → 设置偏好/战力 → 创建赛事 → 加入 → 分队"""
import json, urllib.request, http.cookiejar, sys, os

BASE = "http://localhost:3002"
COOKIE_JAR = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(COOKIE_JAR))

def api(method, path, data=None):
    url = f"{BASE}{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    try:
        resp = opener.open(req)
        return json.loads(resp.read()), resp.status
    except urllib.error.HTTPError as e:
        return json.loads(e.read()), e.code

# ── 10个测试用户 ──
# (username, topPref, junglePref, midPref, adcPref, supPref, peakScore, roleRank, peakRank, mainRole)
PROFILES = [
    ("顶级对抗", 1, 5, 4, 3, 2, 2100, 9, 9, "top"),
    ("打野之王", 5, 1, 4, 3, 2, 1950, 8, 8, "jungle"),
    ("中路法王", 4, 5, 1, 3, 2, 2200, 8, 9, "mid"),
    ("射手神话", 3, 4, 5, 1, 2, 1800, 7, 7, "adc"),
    ("游走大师", 2, 3, 4, 5, 1, 1600, 7, 7, "support"),
    ("全能选手A", 2, 3, 1, 4, 5, 1500, 6, 6, "mid"),
    ("全能选手B", 1, 2, 3, 4, 5, 1700, 7, 6, "top"),
    ("新手对抗", 1, 5, 4, 3, 2, 800, 3, 4, "top"),
    ("打野新手", 5, 1, 4, 3, 2, 600, 2, 3, "jungle"),
    ("中单萌新", 4, 5, 1, 3, 2, 500, 2, 2, "mid"),
]

PASSWORD = "pass123456789"

print("=== 王者演武堂分队算法测试 ===\n")

# ── Step 1: 注册/登录 ──
print(">>> 注册/登录")
user_ids = []
for username, *_ in PROFILES:
    # 先尝试注册
    data, code = api("POST", "/api/auth/register", {
        "username": username,
        "password": PASSWORD,
        "confirmPassword": PASSWORD,
        "securityQuestion": "你的出生城市是？",
        "securityAnswer": "test",
    })
    if code == 200:
        print(f"  {username} 注册成功 → uid={data['id']}")
        user_ids.append(data['id'])
    elif code == 409:
        # 已存在，登录
        data, code = api("POST", "/api/auth/login", {"username": username, "password": PASSWORD})
        if code == 200:
            print(f"  {username} 登录成功 → uid={data['id']}")
            user_ids.append(data['id'])
        else:
            print(f"  {username} 登录失败: {data}")
            user_ids.append(0)
    else:
        print(f"  {username} 失败: {data}")
        user_ids.append(0)

# ── Step 2: 设置偏好 + 英雄战力 ──
print("\n>>> 设置分路偏好 & 英雄战力")
for i, (profile, uid) in enumerate(zip(PROFILES, user_ids)):
    username, tp, jp, mp, ap, sp, ps, rr, pr, main_role = profile
    # 登录
    api("POST", "/api/auth/login", {"username": username, "password": PASSWORD})

    # 设置分路偏好
    roles_list = ["top", "jungle", "mid", "adc", "support"]
    prefs = [tp, jp, mp, ap, sp]
    data, code = api("PUT", "/api/users/me/roles", {
        "preferences": [
            {"role_type": r, "preference_rank": pf, "role_rank": rr, "peak_score": ps, "peak_rank": pr}
            for r, pf in zip(roles_list, prefs)
        ]
    })
    ok1 = "OK" if code == 200 else f"ERR({code})"

    # 主分路设置3个英雄战力, 其他分路留空
    hero_count = 0
    for h_idx in range(1, 4):
        hid = i * 100 + h_idx
        data, code = api("POST", "/api/users/me/heroes", {
            "roleType": main_role,
            "heroId": hid,
            "heroName": f"测试英雄{i}-{h_idx}",
            "powerScore": 8000 + h_idx * 1500,
        })
        if code in (200, 409):
            hero_count += 1

    print(f"  [{i+1}] {username:10s} main={main_role} rank={rr} peak={ps}  pref={ok1}  heroes={hero_count}")

# ── Step 3: 创建赛事 ──
print("\n>>> 创建赛事")
api("POST", "/api/auth/login", {"username": PROFILES[0][0], "password": PASSWORD})
data, code = api("POST", "/api/tournaments", {
    "name": "算法测试赛",
    "deadline": "2026-12-31T23:59:59Z",
    "isPublic": True,
})
tid = data["tournament"]["id"]
tcode = data["tournament"]["code"]
print(f"  赛事: id={tid}  code={tcode}")

# ── Step 4: 加入 ──
print("\n>>> 加入赛事")
for i, (profile, uid) in enumerate(zip(PROFILES, user_ids)):
    username = profile[0]
    api("POST", "/api/auth/login", {"username": username, "password": PASSWORD})
    data, code = api("POST", "/api/tournaments/join-by-code", {"code": tcode})
    status = "OK" if code == 200 else f"ERR: {data.get('error','?')}"
    print(f"  [{i+1}] {username:10s} {status}")

# ── Step 5: 分队 ──
print("\n" + "=" * 50)
print("  执行分队")
print("=" * 50)

api("POST", "/api/auth/login", {"username": PROFILES[0][0], "password": PASSWORD})
data, code = api("POST", f"/api/tournaments/{tid}/split", {})

if "error" in data:
    print(f"\n分队失败: {data['error']}")
    sys.exit(1)

role_names = {"top": "对抗路", "jungle": "打野", "mid": "中路", "adc": "发育路", "support": "游走"}

for team_name, team_key in [("[RED] 红队", "teamRed"), ("[BLUE] 蓝队", "teamBlue")]:
    print(f"\n--- {team_name} ---")
    total_str = 0
    for p in data[team_key]:
        detail = next((d for d in data.get("playerDetails", []) if d["userId"] == p["userId"]), None)
        name = detail["username"] if detail else f"User#{p['userId']}"
        role = role_names.get(p["roleType"], p["roleType"])
        # 查找该玩家的偏好得分
        pref_profile = next((pr for pr in PROFILES if pr[0] == name), None)
        if pref_profile:
            pref_map = {r: pf for r, pf in zip(role_names.keys(), pref_profile[1:6])}
            pref_rank = pref_map.get(p["roleType"], "?")
        else:
            pref_rank = "?"
        print(f"  {name:12s} → {role:6s} (偏好#{pref_rank})")

diff = data.get("strengthDiff", 999)
pref = data.get("preferenceScore", 0)
print(f"\n战力差: {diff}")
print(f"偏好分: {pref}")

if diff <= 200:
    print("评价: 完美平衡 ***")
elif diff <= 500:
    print("评价: 基本均衡")
else:
    print("评价: 差距较大")

print("\n=== 测试完成 ===")
