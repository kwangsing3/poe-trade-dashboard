'use strict';
// ── 繁體中文品項名稱對照 ────────────────────────────────────────────────────────
// 精華精品以 pattern 函式處理，其餘使用靜態對照表

const ESSENCE_TIER = {
  whispering:'低語', muttering:'喃喃', weeping:'哭泣',
  wailing:'哀號', screaming:'尖叫', shrieking:'嘶叫', deafening:'震耳',
};
const ESSENCE_ELEMENT = {
  hatred:'憎恨', woe:'哀愁', greed:'貪婪', contempt:'鄙視',
  sorrow:'悲傷', anger:'憤怒', torment:'苦難', fear:'恐懼',
  suffering:'折磨', rage:'激怒', wrath:'憤怒', doubt:'疑惑',
  anguish:'煎熬', loathing:'厭惡', spite:'怨恨', zeal:'熱誠',
  misery:'痛苦', dread:'恐慌', scorn:'輕蔑', envy:'嫉妒',
  desolation:'荒涼',
};
const HEIST_SKILL = {
  lockpicking:'開鎖', 'brute-force':'蠻力', perception:'感知',
  demolition:'爆破', 'counter-thaumaturgy':'反制奇術',
  'trap-disarmament':'拆除陷阱', agility:'敏捷',
  deception:'欺騙', engineering:'工程',
};
const HEIST_TIER = { low:'(68-72級)', mid:'(73-77級)', high:'(78-82級)', top:'(83+級)' };

const ITEM_ZH = {
  // ── Oils ──────────────────────────────────────────────────────────
  'clear-oil':'清澈之油','sepia-oil':'棕褐之油','amber-oil':'琥珀之油',
  'verdant-oil':'翠綠之油','teal-oil':'藍綠之油','azure-oil':'湛藍之油',
  'indigo-oil':'靛藍之油','violet-oil':'紫羅蘭之油','crimson-oil':'深紅之油',
  'black-oil':'黑色之油','opalescent-oil':'蛋白石之油','silver-oil':'銀色之油',
  'golden-oil':'黃金之油','prismatic-oil':'稜晶之油','tainted-oil':'腐化之油',
  'reflective-oil':'反射之油','oil-extractor':'油脂萃取器',

  // ── Catalysts ─────────────────────────────────────────────────────
  'turbulent-catalyst':'動盪催化劑','imbued-catalyst':'注魔催化劑',
  'abrasive-catalyst':'研磨催化劑','tempering-catalyst':'磨練催化劑',
  'fertile-catalyst':'滋養催化劑','prismatic-catalyst':'稜晶催化劑',
  'intrinsic-catalyst':'固有催化劑','noxious-catalyst':'劇毒催化劑',
  'accelerating-catalyst':'加速催化劑','unstable-catalyst':'不穩催化劑',
  'tainted-catalyst':'腐化催化劑','sinistral-catalyst':'左旋催化劑',
  'dextral-catalyst':'右旋催化劑',

  // ── Fossils ───────────────────────────────────────────────────────
  'scorched-fossil':'焦灼化石','frigid-fossil':'冷凍化石','metallic-fossil':'金屬化石',
  'jagged-fossil':'鋸齒化石','aberrant-fossil':'異常化石','pristine-fossil':'原始化石',
  'dense-fossil':'緻密化石','corroded-fossil':'腐蝕化石','prismatic-fossil':'稜晶化石',
  'aetheric-fossil':'以太化石','serrated-fossil':'鋸牙化石','lucent-fossil':'明亮化石',
  'shuddering-fossil':'顫抖化石','bound-fossil':'束縛化石','opulent-fossil':'富饒化石',
  'deft-fossil':'靈巧化石','fundamental-fossil':'基礎化石','faceted-fossil':'切面化石',
  'bloodstained-fossil':'血跡化石','hollow-fossil':'中空化石','fractured-fossil':'碎裂化石',
  'glyphic-fossil':'象形化石','tangled-fossil':'糾纏化石','sanctified-fossil':'神聖化石',
  'gilded-fossil':'鍍金化石',
  // Resonators
  'primitive-chaotic-resonator':'原始混沌共鳴器','potent-chaotic-resonator':'有效混沌共鳴器',
  'powerful-chaotic-resonator':'強效混沌共鳴器','prime-chaotic-resonator':'頂級混沌共鳴器',

  // ── Delirium Orbs ─────────────────────────────────────────────────
  'fine-delirium-orb':'精緻幻象石','singular-delirium-orb':'奇異幻象石',
  'thaumaturges-delirium-orb':'奇術師幻象石','blacksmiths-delirium-orb':'鐵匠幻象石',
  'armoursmiths-delirium-orb':'鎧甲師幻象石','cartographers-delirium-orb':'地圖師幻象石',
  'jewellers-delirium-orb':'珠寶商幻象石','abyssal-delirium-orb':'深淵幻象石',
  'kalguuran-delirium-orb':'卡爾古拉幻象石','obscured-delirium-orb':'晦暗幻象石',
  'whispering-delirium-orb':'低語幻象石','fragmented-delirium-orb':'碎片幻象石',
  'skittering-delirium-orb':'爬行幻象石','fossilised-delirium-orb':'化石幻象石',
  'diviners-delirium-orb':'占卜師幻象石','delirium-orb':'幻象石',
  'primal-delirium-orb':'原始幻象石','timeless-delirium-orb':'永恆幻象石',
  'blighted-delirium-orb':'枯萎幻象石','challenging-delirium-orb':'挑戰幻象石',

  // ── Expedition ────────────────────────────────────────────────────
  'astragali':'距骨','exotic-coinage':'異域硬幣',
  'scrap-metal':'廢金屬','burial-medallion':'埋葬紀念章',

  // ── Incubators ────────────────────────────────────────────────────
  'whispering-incubator':'低語孵化器','fine-incubator':'精緻孵化器',
  'singular-incubator':'奇異孵化器','cartographers-incubator':'地圖師孵化器',
  'otherworldly-incubator':'異界孵化器','abyssal-incubator':'深淵孵化器',
  'fragmented-incubator':'碎片孵化器','skittering-incubator':'爬行孵化器',
  'infused-incubator':'注入孵化器','fossilised-incubator':'化石孵化器',
  'kalguuran-incubator':'卡爾古拉孵化器','diviners-incubator':'占卜師孵化器',
  'primal-incubator':'原始孵化器','enchanted-incubator':'魔法孵化器',
  'geomancers-incubator':'地占師孵化器','ornate-incubator':'華麗孵化器',
  'time-lost-incubator':'失落時光孵化器','celestial-armoursmiths-incubator':'天象鎧甲師孵化器',
  'celestial-blacksmiths-incubator':'天象鐵匠孵化器','celestial-jewellers-incubator':'天象珠寶商孵化器',
  'eldritch-incubator':'魔神孵化器','obscured-incubator':'晦暗孵化器',
  'foreboding-incubator':'不祥孵化器','thaumaturges-incubator':'奇術師孵化器',
  'mysterious-incubator':'神秘孵化器','gemcutters-incubator':'寶石切割師孵化器',
  'feral-incubator':'野性孵化器','blighted-incubator':'枯萎孵化器',
  'challenging-incubator':'挑戰孵化器','maddening-incubator':'狂亂孵化器',

  // ── Keepers ───────────────────────────────────────────────────────
  'foulborn-orb-of-augmentation':'腐生強化石','foulborn-regal-orb':'腐生皇家石',
  'foulborn-exalted-orb':'腐生崇高石','provisioning-wombgift':'供應子宮恩賜',
  'lavish-wombgift':'豐盛子宮恩賜','ancient-wombgift':'古代子宮恩賜',
  'mysterious-wombgift':'神秘子宮恩賜',

  // ── DjinnCoins ────────────────────────────────────────────────────
  'coin-of-restoration':'恢復精靈幣','coin-of-desecration':'褻瀆精靈幣',
  'coin-of-knowledge':'知識精靈幣','coin-of-power':'力量精靈幣','coin-of-skill':'技巧精靈幣',

  // ── AllflameEmbers ────────────────────────────────────────────────
  'allflame-ember-of-kulemak':'庫勒馬克萬焰餘燼','allflame-ember-of-resplendence':'光輝萬焰餘燼',
  'allflame-ember-of-propagation':'繁殖萬焰餘燼','allflame-ember-of-flesh':'血肉萬焰餘燼',
  'allflame-ember-of-the-wildwood':'荒野萬焰餘燼','allflame-ember-of-the-ethereal':'以太萬焰餘燼',
  'allflame-ember-of-the-gilded':'鍍金萬焰餘燼','allflame-ember-of-toads':'蟾蜍萬焰餘燼',

  // ── Runegrafts ────────────────────────────────────────────────────
  'runegraft-of-the-river':'河流符文嫁接','runegraft-of-the-fortress':'堡壘符文嫁接',
  'runegraft-of-the-combatant':'戰士符文嫁接','runegraft-of-the-sinistral':'左旋符文嫁接',
  'runegraft-of-the-bound':'束縛符文嫁接','runegraft-of-the-warp':'扭曲符文嫁接',
  'runegraft-of-the-soulwick':'靈魂燈蕊符文嫁接','runegraft-of-bellows':'風箱符文嫁接',
  'runegraft-of-gemcraft':'寶石鑄造符文嫁接','runegraft-of-blasphemy':'褻瀆符文嫁接',
  'runegraft-of-time':'時間符文嫁接','runegraft-of-treachery':'背叛符文嫁接',
  'runegraft-of-quaffing':'豪飲符文嫁接','runegraft-of-restitching':'重縫符文嫁接',
  'runegraft-of-loyalty':'忠誠符文嫁接','runegraft-of-the-witchmark':'巫印符文嫁接',
  'runegraft-of-the-novamark':'新星印記符文嫁接','runegraft-of-refraction':'折射符文嫁接',
  'runegraft-of-the-jeweller':'珠寶商符文嫁接','runegraft-of-stability':'穩定符文嫁接',
  'runegraft-of-the-angler':'漁夫符文嫁接','runegraft-of-consecration':'神聖符文嫁接',
  'runegraft-of-fury':'狂怒符文嫁接','runegraft-of-rallying':'集結符文嫁接',
  'runegraft-of-rotblood':'腐血符文嫁接','runegraft-of-the-imbued':'注魔符文嫁接',
  'runegraft-of-the-agile':'敏捷符文嫁接','runegraft-of-suffering':'折磨符文嫁接',
  'runegraft-of-the-spellbound':'咒縛符文嫁接','runegraft-of-resurgence':'復甦符文嫁接',
  'runegraft-of-connection':'連結符文嫁接',

  // ── Essences (special non-pattern) ───────────────────────────────
  'essence-of-hysteria':'歇斯底里精華','essence-of-insanity':'瘋狂精華',
  'essence-of-horror':'恐怖精華','essence-of-delirium':'狂亂精華',
  'essence-of-desolation':'荒涼精華',
  'remnant-of-corruption':'墮落之遺跡',

  // ── Fragments ─────────────────────────────────────────────────────
  'dusk':'薄暮獻祭','mid':'午夜獻祭','dawn':'黎明獻祭','noon':'正午獻祭',
  'grie':'凡人之悲','rage':'凡人之怒','hope':'凡人之望','ign':'凡人之愚',
  'hydra':'蛇妖碎片','phoenix':'鳳凰碎片','minot':'牛頭人碎片','chimer':'奇美拉碎片',
  'fragment-of-enslavement':'奴役之碎片','fragment-of-eradication':'根除之碎片',
  'fragment-of-constriction':'束縛之碎片','fragment-of-purification':'淨化之碎片',
  'fragment-of-terror':'恐懼之碎片','fragment-of-emptiness':'虛空之碎片',
  'fragment-of-shape':'形態之碎片','fragment-of-knowledge':'知識之碎片',
  'al-hezmins-crest':'阿赫茲明的徽章','barans-crest':'巴蘭的徽章',
  'droxs-crest':'德洛克斯的徽章','veritanias-crest':'維裡塔尼亞的徽章',
  'beauty':'美麗','curiosity':'好奇','ambition':'雄心','cooperation':'合作',
  'offer':'獻給女神的供品','offer-tribute':'獻給女神的貢品',
  'offer-gift':'獻給女神的禮物','offer-dedication':'獻給女神的奉獻',
  'sacrifice-set':'獻祭套組','mortal-set':'凡人套組',
  'shaper-set':'熔爐之鑰','key-to-decay':'腐化之鑰',
  'maddening-object':'致狂之物','crest-of-the-elderslayers':'上古殺手徽章',
  'timeless-eternal-emblem':'永恆帝國紀念章','timeless-karui-emblem':'卡魯伊紀念章',
  'timeless-vaal-emblem':'瓦爾紀念章','timeless-templar-emblem':'聖堂武士紀念章',
  'timeless-maraketh-emblem':'瑪拉克赫紀念章',
  'uber-timeless-eternal-emblem':'無盡永恆帝國紀念章','uber-timeless-karui-emblem':'無盡卡魯伊紀念章',
  'uber-timeless-vaal-emblem':'無盡瓦爾紀念章','uber-timeless-templar-emblem':'無盡聖堂武士紀念章',
  'uber-timeless-maraketh-emblem':'無盡瑪拉克赫紀念章',
  'simulacrum':'幻象','sacred-blossom':'神聖花朵','ritual-vessel':'儀式容器',
  'an-audience-with-the-king':'覲見吾王','syndicate-medallion':'幫派紀念章',
  'divine-vessel':'神聖容器','the-black-barya':'黑色巴亞',
  'awakening-fragment':'覺醒碎片','cosmic-fragment':'宇宙碎片',
  'blazing-fragment':'燃燒碎片','reality-fragment':'現實碎片',
  'decaying-fragment':'腐化碎片','devouring-fragment':'吞噬碎片',
  'synthesising-fragment':'合成碎片',
  'echo-of-loneliness':'孤獨回聲','echo-of-trauma':'創傷回聲','echo-of-reverence':'崇敬回聲',
  'traumatic-fragment':'創傷碎片','reverent-fragment':'崇敬碎片','lonely-fragment':'孤獨碎片',
  'ancient-reliquary-key':'古代遺物鑰匙','timeworn-reliquary-key':'時光遺物鑰匙',
  'vaal-reliquary-key':'瓦爾遺物鑰匙','forgotten-reliquary-key':'遺忘遺物鑰匙',
  'visceral-reliquary-key':'內臟遺物鑰匙','shiny-reliquary-key':'閃亮遺物鑰匙',
  'archive-reliquary-key':'檔案遺物鑰匙','oubliette-reliquary-key':'地牢遺物鑰匙',
  'cosmic-reliquary-key':'宇宙遺物鑰匙','decaying-reliquary-key':'腐化遺物鑰匙',
  'voidborn-reliquary-key':'虛空遺物鑰匙','lonely-reliquary-key':'孤獨遺物鑰匙',
  'reverent-reliquary-key':'崇敬遺物鑰匙','traumatic-reliquary-key':'創傷遺物鑰匙',
  'valdos-puzzle-box':'瓦爾多的謎題盒',
  'blessing-xoph':'佐夫之祝福','blessing-tul':'圖爾之祝福','blessing-esh':'阿修之祝福',
  'blessing-uul-netol':'烏爾·涅托爾之祝福','blessing-chayula':'恰羽拉之祝福',
  'hivebrain-gland':'蜂巢腺體',
  'the-mavens-writ':'行家的神諭',
  'writhing-invitation':'扭動之邀','screaming-invitation':'尖叫之邀',
  'polaric-invitation':'極性之邀','incandescent-invitation':'白熾之邀',
  'timeless-eternal-empire-splinter':'永恆帝國碎片','timeless-karui-splinter':'卡魯伊碎片',
  'timeless-vaal-splinter':'瓦爾碎片','timeless-templar-splinter':'聖堂武士碎片',
  'timeless-maraketh-splinter':'瑪拉克赫碎片',
  'simulacrum-splinter':'幻象碎片','crescent-splinter':'新月碎片','ritual-splinter':'儀式碎片',
  'memory-of-trauma':'創傷記憶','memory-of-reverence':'崇敬記憶','memory-of-loneliness':'孤獨記憶',
  'templar-astrolabe':'聖堂武士星盤','fruiting-astrolabe':'結果星盤','lightless-astrolabe':'無光星盤',
  'grasping-astrolabe':'抓握星盤','nameless-astrolabe':'無名星盤','fungal-astrolabe':'真菌星盤',
  'chaotic-astrolabe':'混沌星盤','enshrouded-astrolabe':'籠罩星盤',
  'timeless-astrolabe':'永恆星盤','runic-astrolabe':'盧恩星盤',
  // Scarabs (common ones)
  'titanic-scarab':'巨大聖甲蟲','sulphite-scarab':'硫磺聖甲蟲',
  'harbinger-scarab':'先兆者聖甲蟲','abyss-scarab':'深淵聖甲蟲',
  'essence-scarab':'精華聖甲蟲','legion-scarab':'軍團聖甲蟲',
  'breach-scarab':'裂縫聖甲蟲','delirium-scarab':'幻象聖甲蟲',
  'expedition-scarab':'遠征聖甲蟲','blight-scarab':'枯萎聖甲蟲',
  'ritual-scarab':'儀式聖甲蟲','harvest-scarab':'豐收聖甲蟲',
  'bestiary-scarab':'動物圖鑑聖甲蟲','incursion-scarab':'入侵聖甲蟲',
  'betrayal-scarab':'背叛聖甲蟲','domination-scarab':'統治聖甲蟲',
  'cartography-scarab':'地圖師聖甲蟲','ambush-scarab':'埋伏聖甲蟲',
  'ultimatum-scarab':'最後通牒聖甲蟲','beyond-scarab':'彼岸聖甲蟲',
  'anarchy-scarab':'無政府聖甲蟲','torment-scarab':'苦難聖甲蟲',
  'kalguuran-scarab':'卡爾古拉聖甲蟲',
  'scarab-of-monstrous-lineage':'怪物血脈聖甲蟲','scarab-of-adversaries':'對手聖甲蟲',
  'scarab-of-divinity':'神性聖甲蟲','scarab-of-hunted-traitors':'叛徒獵殺聖甲蟲',
  'scarab-of-stability':'穩定聖甲蟲','scarab-of-wisps':'靈焰聖甲蟲',
  'scarab-of-the-sinistral':'左旋聖甲蟲','scarab-of-the-dextral':'右旋聖甲蟲',
  'scarab-of-radiant-storms':'輝光風暴聖甲蟲',
  'horned-scarab-of-bloodlines':'血脈有角聖甲蟲','horned-scarab-of-nemeses':'仇敵有角聖甲蟲',
  'horned-scarab-of-preservation':'保存有角聖甲蟲','horned-scarab-of-awakening':'覺醒有角聖甲蟲',
  'horned-scarab-of-tradition':'傳統有角聖甲蟲','horned-scarab-of-glittering':'閃耀有角聖甲蟲',
  'horned-scarab-of-pandemonium':'大混亂有角聖甲蟲',
  'divination-scarab-of-the-cloister':'修道院占卜聖甲蟲',
  'divination-scarab-of-plenty':'豐盛占卜聖甲蟲','divination-scarab-of-pilfering':'竊取占卜聖甲蟲',

  // ── Maps ─────────────────────────────────────────────────────────
  'nightmare-map':'夢魘地圖','vaal-temple-map':'瓦爾神殿地圖','valdo-map':'瓦爾多地圖',
  // MapsSpecial
  'al-hezmins-map':'阿赫茲明的城堡地圖','barans-map':'巴蘭的城堡地圖',
  'droxs-map':'德洛克斯的城堡地圖','veritanias-map':'維裡塔尼亞的城堡地圖',
  'enslaver-map':'被奴役者佔領地圖','eradicator-map':'根除者佔領地圖',
  'constrictor-map':'束縛者佔領地圖','purifier-map':'淨化者佔領地圖',
  'shaper-guardian-map':'型塑者守衛地圖',
  // MapsUnique
  'vaults-of-atziri':'阿芝里的寶庫','maelstrom-of-chaos':'混沌大漩渦',
  'the-cowards-trial':'懦夫的試煉','actons-nightmare':'阿克頓的夢魘',
  'poorjoys-asylum':'窮快樂的庇護所','mao-kun':'茅坤',
  'obas-cursed-trove':'歐巴的詛咒寶庫','olmecs-sanctum':'奧爾梅克的聖殿',
  'untainted-paradise':'純潔樂園','death-and-taxes':'死亡與稅收',
  'whakawairua-tuahu':'瓦卡瓦伊魯亞·圖阿胡','hall-of-grandmasters':'宗師大廳',
  'the-vinktar-square':'文克塔廣場','caer-blaidd-wolfpacks-den':'布萊德·狼群之穴',
  'the-putrid-cloister':'腐臭修道院','hallowed-ground':'聖地',
  'the-twilight-temple':'暮光神殿','doryanis-machinarium':'多里亞尼的機械館',
  'pillars-of-arun':'阿倫柱廊','altered-distant-memory':'扭曲的遠古記憶',
  'augmented-distant-memory':'強化的遠古記憶','twisted-distant-memory':'扭曲的遠古記憶',
  'rewritten-distant-memory':'改寫的遠古記憶','cortex':'皮質',
  'replica-cortex':'複製皮質','replica-pillars-of-arun':'複製阿倫柱廊',
  'replica-poorjoys-asylum':'複製窮快樂的庇護所',

  // ── Sanctum ───────────────────────────────────────────────────────
  'the-hour-of-divinity':'神聖時刻','the-gilded-chalice':'鍍金聖杯',
  'the-second-sacrament':'第二聖禮','the-night-lamp':'夜燈',
  'the-first-crest':'第一徽章','the-broken-censer':'破碎香爐',
  'the-original-scripture':'原始聖典','the-blood-of-innocence':'純真之血',
  'the-chains-of-castigation':'懲罰之鏈','the-power-and-the-promise':'權力與承諾',
};

// ── Pattern-based translators ─────────────────────────────────────────────────

function translateEssence(id) {
  const m = id.match(/^(.+?)-essence-of-(.+)$/);
  if (!m) return null;
  const tier = ESSENCE_TIER[m[1]];
  const elem = ESSENCE_ELEMENT[m[2]];
  if (!tier || !elem) return null;
  return `${tier}精華・${elem}`;
}

function translateMap(id) {
  const blightRavaged = id.match(/^blight-ravaged-map-tier-(\d+)$/);
  if (blightRavaged) return `第${blightRavaged[1]}層枯萎肆虐地圖`;
  const blighted = id.match(/^blighted-map-tier-(\d+)$/);
  if (blighted) return `第${blighted[1]}層枯萎地圖`;
  const zana = id.match(/^zana-map-tier-(\d+)$/);
  if (zana) return `第${zana[1]}層混沌窟地圖`;
  const normal = id.match(/^map-tier-(\d+)$/);
  if (normal) return `第${normal[1]}層地圖`;
  return null;
}

function translateForbiddenTome(id) {
  const m = id.match(/^forbidden-tome-level-(\d+)$/);
  if (m) return `禁書（${m[1]}級）`;
  return null;
}

function translateHeist(id) {
  const contract = id.match(/^(.+?)-contract-(low|mid|high|top)$/);
  if (contract) {
    const skill = HEIST_SKILL[contract[1]];
    const tier  = HEIST_TIER[contract[2]];
    if (skill && tier) return `${skill}合約${tier}`;
  }
  const blueprint = id.match(/^blueprint-(low|mid|high|top-\d+-wings)$/);
  if (blueprint) {
    const t = blueprint[1];
    const map = { low:'(68-72級)', mid:'(73-77級)', high:'(78-82級)' };
    if (map[t]) return `搶劫藍圖${map[t]}`;
    const wings = t.match(/top-(\d+)-wings/);
    if (wings) return `搶劫藍圖(83+級，${wings[1]}翼)`;
  }
  return null;
}

function translateScarabSuffix(id) {
  // e.g. titanic-scarab-of-treasures → 財富巨大聖甲蟲
  const m = id.match(/^(.+)-scarab-of-(.+)$/) || id.match(/^horned-scarab-of-(.+)$/);
  if (!m) return null;
  if (m.length === 3) {
    const base = ITEM_ZH[m[1]+'-scarab'];
    if (base) {
      const suffix = m[2].replace(/-/g,' ');
      return base.replace('聖甲蟲', `・${suffix}聖甲蟲`);
    }
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────
function itemName(id, fallbackText) {
  if (ITEM_ZH[id]) return ITEM_ZH[id];
  return translateEssence(id)
      || translateMap(id)
      || translateForbiddenTome(id)
      || translateHeist(id)
      || fallbackText
      || id;
}
