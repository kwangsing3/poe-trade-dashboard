import urllib.request, os, time, sys

BASE = "https://web.poecdn.com/image/Art/2DItems/Currency/"
OUT  = os.path.join(os.path.dirname(__file__), "..", "public", "res", "img")
os.makedirs(OUT, exist_ok=True)

CURRENCIES = {
    "chaos":        "CurrencyRerollRare.png",
    "divine":       "CurrencyModValues.png",
    "exalted":      "CurrencyAddModToRare.png",
    "mirror":       "CurrencyDuplicate.png",
    "annul":        "AnnullOrb.png",                    # double-l, AnnulmentOrb → 404
    "ancient-orb":  "AncientOrb.png",
    "vaal":         "CurrencyVaal.png",
    "regal":        "CurrencyUpgradeMagicToRare.png",
    "gcp":          "CurrencyGemQuality.png",           # CurrencyGemcutterPrism → 404
    "alch":         "CurrencyUpgradeToRare.png",
    "fusing":       "CurrencyRerollSocketLinks.png",
    "alt":          "CurrencyRerollMagic.png",
    "chrome":       "CurrencyRerollSocketColours.png",
    "jewellers":    "CurrencyRerollSocketNumbers.png",
    "chance":       "CurrencyUpgradeToMagic.png",
    "scour":        "CurrencyConvertToNormal.png",
    "regret":       "CurrencyPassiveSkillRefund.png",  # CurrencyPassiveRefund → 404
    "blessed":      "CurrencyImplicitMod.png",
    "transmute":    "CurrencyUpgradeToMagicShard.png",
    "aug":          "CurrencyAddModToMagic.png",
    "chisel":       "CurrencyMapQuality.png",
    "wisdom":       "CurrencyIdentification.png",
    "portal":       "CurrencyPortal.png",
    "whetstone":    "CurrencyWeaponQuality.png",
    "scrap":        "CurrencyArmourQuality.png",
    "bauble":       "CurrencyFlaskQuality.png",
    "eternal":      "CurrencyImprintOrb.png",
    "engineers":    "EngineersOrb.png",
}

headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
ok, fail = [], []

for cid, fname in CURRENCIES.items():
    url  = BASE + fname
    dest = os.path.join(OUT, cid + ".png")
    req  = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = r.read()
            with open(dest, "wb") as f:
                f.write(data)
            ok.append(cid)
            print(f"  OK  {cid}  ({len(data)} bytes)")
    except Exception as e:
        fail.append((cid, str(e)))
        print(f"  ERR {cid}: {e}", file=sys.stderr)
    time.sleep(0.05)

print(f"\nResult: {len(ok)} OK, {len(fail)} failed")
if fail:
    print("Failed:", [c for c, _ in fail])
