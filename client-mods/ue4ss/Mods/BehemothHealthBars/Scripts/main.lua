print("[BHB] BehemothHealthBars loading...")
-- Behemoth Health Bars: a fixed health bar (and a smaller shield bar under it) for the behemoth,
-- bottom-middle of the screen, styled like the player's own health bar. With two living
-- behemoths (escalations) there are two bar sets side by side.
--
-- All periodic work runs from Mods\shared\FrameTick (hooked to the HUD compass Tick, on the
-- game thread), never from LoopAsync, so hot reload (Ctrl+R) cannot hang on a running loop.
--
-- Bar widget: /Game/UI/EndOfHunt/StackableProgressBar.StackableProgressBar_C
--   ProgressBarComponent (a real UMG ProgressBar inside SizeBox_0), BoostIconBarImage (used as the frame)
-- Skin borrowed from the player's health bar:
--   /Game/UI/HUD/HealthStamina_bpw.HealthStamina_bpw_C:WidgetTree.{frame_back, forgroundframe, HealthBarImage}
--   backing = frame_back brush, frame = forgroundframe brush (drawn behind the bar, slightly larger),
--   shear copied from the HUD chain (-20). Brushes are written BEFORE AddToViewport (Slate reads
--   them when the widget is built).
-- Shield: /Script/Archon.ArchonHealthAttributeSet.CurrentShield (no max value: the peak seen is used).
--   The attribute set is a subobject of the behemoth, found by object path.
-- Gotcha: SetPositionInViewport resets viewport anchors to (0,0) - set anchors AFTER it.
--
-- Keys: F7-F10 move, F11/F12 width -/+ (until the next reload).

local FrameTick = require("FrameTick")
-- Live settings from the Mod Menu (shared\ModSettings): bhb_shield, bhb_text, bhb_dual.
local ModSettings = require("ModSettings")

-- ---------------------------------------------------------------- settings

local ANCHOR = {X = 0.5, Y = 1.0}      -- bottom-middle of the screen
local POS_X, POS_Y = 0, -240           -- offset of the main widget's bottom-middle from that point
local SCALE = 1.69
local SIZE_X = math.floor(400 * SCALE + 0.5)
local SIZE_Y = math.floor(30 * SCALE + 0.5)
local BAR_H = math.floor(22 * SCALE + 0.5)
local STEP = 10
local WSTEP = 20

local SHOW_SHIELD = true
-- Shading like the player's health bar: a soft white highlight at the top and a dark band at
-- the bottom. Each band is a gradient made of SHADE_STEPS stacked layers (the shortest layer,
-- at the edge, is covered by every layer, so the band is strongest at the edge).
-- *_EDGE = opacity right at the bar's edge; *_FRAC = how far the fade reaches into the bar.
local SHADE = true
local SHADE_STEPS = 5
local SHADE_EDGE = 0.08                -- top highlight (white)
local SHADE_FRAC = 0.50
local SHADOW_EDGE = 0.40               -- bottom shadow (black)
local SHADOW_FRAC = 0.55
local function LayerAlpha(edge) return 1 - (1 - edge) ^ (1 / SHADE_STEPS) end
local SHADE_COLOR = {R = 1, G = 1, B = 1, A = LayerAlpha(SHADE_EDGE)}
local SHADOW_COLOR = {R = 0, G = 0, B = 0, A = LayerAlpha(SHADOW_EDGE)}

local SHIELD_W_FRAC = 0.75             -- shield bar width relative to the main bar
local SHIELD_H_FRAC = 0.55             -- shield bar height relative to the main bar
local SHIELD_GAP = 3                   -- extra px between the two borders
local SHIELD_COLOR = {R = 0.22, G = 0.55, B = 0.85, A = 1.0}
local SHIELD_MIN_FRAC = 0.005          -- hide the shield bar at or below this fraction of its max
local SHIELD_TEXT = true               -- "cur/max" on the shield bar, same font as the HP text
local SHIELD_TEXT_RAISE = math.floor(4 * SCALE + 0.5)   -- px the shield number sits above centre

local PATH = "/Game/UI/EndOfHunt/StackableProgressBar.StackableProgressBar_C"
local ASSET = "/Game/UI/EndOfHunt/StackableProgressBar"
local HUD = "/Game/UI/HUD/HealthStamina_bpw.HealthStamina_bpw_C:WidgetTree."

local SHOW_TEXT = false
local TEXT_PATH = "/Game/UI/Chat/w_chat_log_label_bpw.w_chat_log_label_bpw_C"
local TEXT_ASSET = "/Game/UI/Chat/w_chat_log_label_bpw"
local SRC_TEXT = "HealthValueText"
local TEXT_SIZE = math.floor(20 * SCALE * 0.85 + 0.5)
local TEXT_COLOR = {R = 1, G = 1, B = 1, A = 1}
local TEXT_INDENT = math.floor(14 * SCALE + 0.5)
local TEXT_OVERLAP = math.floor(6 * SCALE + 0.5)

local FILL_COLOR = {R = 0.62, G = 0.08, B = 0.07, A = 1.0}
local BORDER_SCALE = 0.5      -- border thickness vs the HUD's (1 = as thick as the player bar's)
local BORDER_DARKEN = 0.5     -- border colour multiplier (1 = HUD grey, lower = darker)
local SLANT_SCALE = 0.85      -- slant vs the HUD's -20 shear
local HUGE_HP = 100000000     -- dojo dummies have ~1.265e9 HP
local RANGE = 0.01

local DUAL_GAP = 40           -- UI units between the two bars (setting bhb_dual: two bar sets)

-- ESlateVisibility: 0 Visible, 1 Collapsed, 2 Hidden, 3 HitTestInvisible
local VIS_SHOWN, VIS_HIDDEN = 3, 1

-- ---------------------------------------------------------------- state

-- The bar code works on these globals; WithSet() swaps a bar set into them (see "bar sets").
local mainBar, shieldBar = nil, nil    -- {widget, bar, sizeBox, boxSlot, frame, frameSlot, w, h, wh, color, shown, lastPct}
local skin = nil
local label, labelText, lastText, labelShown = nil, nil, nil, nil
local sLabel, sLabelText, sLastText, sLabelShown = nil, nil, nil, nil
local lastHealth, targetKey = {}, nil
local attrCache, shieldPeak, shieldSrcLogged = {}, {}, {}
local creating = false
local errLogged = {}

local function log(m) print("[BHB] " .. tostring(m)) end
local function logOnce(k, m) if not errLogged[k] then errLogged[k] = true log(m) end end

local function valid(o)
    if not o then return false end
    local ok, v = pcall(function() return o:IsValid() end)
    return ok and v
end

-- ---------------------------------------------------------------- brushes / skin

local function ReadBrush(b)
    local r = {}
    pcall(function() r.res = b.ResourceObject end)
    pcall(function() r.drawAs = b.DrawAs end)
    pcall(function() r.tiling = b.Tiling end)
    pcall(function() r.mirroring = b.Mirroring end)
    pcall(function() r.imageType = b.ImageType end)
    pcall(function() local s = b.ImageSize r.size = {X = s.X, Y = s.Y} end)
    pcall(function()
        local m = b.Margin
        r.margin = {Left = m.Left, Top = m.Top, Right = m.Right, Bottom = m.Bottom}
    end)
    pcall(function()
        local c = b.TintColor.SpecifiedColor
        r.tint = {R = c.R, G = c.G, B = c.B, A = c.A}
    end)
    return r
end

-- Copies brush fields one by one into dst (a SlateBrush on a live object).
local function WriteBrush(dst, src, tag)
    local function set(name, fn)
        local ok, err = pcall(fn)
        if not ok then logOnce(tag .. name, "ERROR " .. tag .. "." .. name .. ": " .. tostring(err)) end
    end
    if src.res ~= nil then set("ResourceObject", function() dst.ResourceObject = src.res end) end
    if src.drawAs ~= nil then set("DrawAs", function() dst.DrawAs = src.drawAs end) end
    if src.tiling ~= nil then set("Tiling", function() dst.Tiling = src.tiling end) end
    if src.mirroring ~= nil then set("Mirroring", function() dst.Mirroring = src.mirroring end) end
    if src.imageType ~= nil then set("ImageType", function() dst.ImageType = src.imageType end) end
    if src.size then set("ImageSize", function() dst.ImageSize = {X = src.size.X, Y = src.size.Y} end) end
    if src.margin then set("Margin", function() dst.Margin = src.margin end) end
    if src.tint then set("TintColor", function() dst.TintColor.SpecifiedColor = src.tint end) end
end

local function Template(name)
    local o = StaticFindObject(HUD .. name)
    if valid(o) then return o end
    log("template not found: " .. HUD .. name)
    return nil
end

local function ChainShear(w)
    local sx, sy, n = 0, 0, 0
    while valid(w) and n < 20 do
        pcall(function()
            local sh = w.RenderTransform.Shear
            sx, sy = sx + sh.X, sy + sh.Y
        end)
        local okP, p = pcall(function() return w:GetParent() end)
        if not (okP and valid(p)) then break end
        w = p
        n = n + 1
    end
    return sx, sy
end

local function LoadSkin()
    if skin then return skin end
    local s = {barShear = {X = -20, Y = 0}, frameShear = {X = -20, Y = 0}}
    local back = Template("frame_back")
    local frame = Template("forgroundframe")
    local info = Template("HealthBarImage")
    if back then s.back = ReadBrush(back.Brush) end
    if frame then
        s.frame = ReadBrush(frame.Brush)
        pcall(function()
            local k = frame.ColorAndOpacity
            s.frameColor = {R = k.R, G = k.G, B = k.B, A = k.A}
        end)
        local fx, fy = ChainShear(frame)
        s.frameShear = {X = fx, Y = fy}
    end
    if info then
        local bx, by = ChainShear(info)
        s.barShear = {X = bx, Y = by}
    end
    log(string.format("skin loaded: back=%s frame=%s barShear=%.1f frameShear=%.1f",
        tostring(s.back ~= nil), tostring(s.frame ~= nil), s.barShear.X, s.frameShear.X))
    skin = s
    return s
end

-- ---------------------------------------------------------------- bar object

local function PinSlot(slot, tag, z, x, y, w, h)
    local steps = {
        {"SetAnchors", function() slot:SetAnchors({Minimum = {X = 0, Y = 0}, Maximum = {X = 0, Y = 0}}) end},
        {"SetAlignment", function() slot:SetAlignment({X = 0, Y = 0}) end},
        {"SetAutoSize", function() slot:SetAutoSize(false) end},
        {"SetPosition", function() slot:SetPosition({X = x, Y = y}) end},
        {"SetSize", function() slot:SetSize({X = w, Y = h}) end},
        {"SetZOrder", function() slot:SetZOrder(z) end},
    }
    for _, s in ipairs(steps) do
        local ok, err = pcall(s[2])
        if not ok then logOnce(tag .. s[1], "ERROR " .. tag .. ":" .. s[1] .. ": " .. tostring(err)) end
    end
end

-- Creates one skinned bar. Must skin before AddToViewport.
-- isShade: a shading band instead - transparent background, no frame, solid fill in `color`,
-- kept at the same percent as its bar.
local function NewBar(PC, Lib, cls, tag, w, h, wh, z, color, isShade)
    local wd = Lib:Create(PC, cls, PC)
    if not valid(wd) then log("Create failed (" .. tag .. ")") return nil end
    local okB, bar = pcall(function() return wd.ProgressBarComponent end)
    if not (okB and valid(bar)) then log("ProgressBarComponent not readable (" .. tag .. ")") return nil end
    local o = {widget = wd, bar = bar, tag = tag, w = w, h = h, wh = wh, color = color, lastPct = -1}

    if isShade then
        if skin and skin.back then
            local clear = {}
            for k, v in pairs(skin.back) do clear[k] = v end
            clear.tint = {R = 0, G = 0, B = 0, A = 0}
            WriteBrush(bar.WidgetStyle.BackgroundImage, clear, tag .. "Back")
        end
        pcall(function() wd.BoostIconBarImage:SetVisibility(VIS_HIDDEN) end)
    elseif skin and skin.back then
        WriteBrush(bar.WidgetStyle.BackgroundImage, skin.back, tag .. "Back")
    end
    if not isShade and skin and skin.frame then
        local okI, icon = pcall(function() return wd.BoostIconBarImage end)
        if okI and valid(icon) then
            WriteBrush(icon.Brush, skin.frame, tag .. "Frame")
            o.frame = icon
            local okS, s = pcall(function() return icon.Slot end)
            if okS and valid(s) then o.frameSlot = s end
        end
    end
    local okP, box = pcall(function() return bar:GetParent() end)
    if okP and valid(box) then
        o.sizeBox = box
        local okS, s = pcall(function() return box.Slot end)
        if okS and valid(s) then o.boxSlot = s end
    end

    wd:AddToViewport(z)
    return o
end

-- Positions a bar: (x, y) is the point given by alignY on the widget (1 = bottom, 0 = top).
local function LayoutBar(o, x, y, alignY)
    if not (o and valid(o.widget)) then return end
    local ok, err = pcall(function()
        o.widget:SetPositionInViewport({X = x, Y = y}, false)
        o.widget:SetDesiredSizeInViewport({X = o.w, Y = o.wh})
    end)
    if not ok then logOnce("lay" .. o.tag, "ERROR layout " .. o.tag .. ": " .. tostring(err)) end
    local okA, errA = pcall(function()
        o.widget:SetAnchorsInViewport({Minimum = {X = ANCHOR.X, Y = ANCHOR.Y}, Maximum = {X = ANCHOR.X, Y = ANCHOR.Y}})
        o.widget:SetAlignmentInViewport({X = 0.5, Y = alignY})
    end)
    if not okA then logOnce("anch" .. o.tag, "ERROR anchors " .. o.tag .. ": " .. tostring(errA)) end
    if valid(o.sizeBox) then
        pcall(function()
            o.sizeBox:SetWidthOverride(o.w)
            o.sizeBox:SetHeightOverride(o.h)
        end)
    end
    if valid(o.boxSlot) then PinSlot(o.boxSlot, o.tag .. "box", 10, 0, o.offY or 0, o.w, o.h) end
    if valid(o.frameSlot) then
        -- HUD frame geometry scaled from its 32px bar: 6.8 left, 7.2 right, 4.8 top, 5.2 bottom;
        -- BORDER_SCALE thins the part of the frame that sticks out past the bar
        local s = o.h / 32 * BORDER_SCALE
        PinSlot(o.frameSlot, o.tag .. "frame", 0, -6.8 * s, -4.8 * s, o.w + 14 * s, o.h + 10 * s)
    end
    if o.shade then
        o.shade.w = o.w
        LayoutBar(o.shade, x, y, alignY)
    end
end

local function FinishBar(o)
    if not (o and valid(o.widget)) then return end
    if skin then
        local target = valid(o.sizeBox) and o.sizeBox or o.widget
        -- a shade band is shorter than its bar: put its shear pivot at the BAR's vertical centre
        -- so its slanted ends line up with the bar's
        if o.pivotY then pcall(function() target:SetRenderTransformPivot({X = 0.5, Y = o.pivotY}) end) end
        local bs = {X = skin.barShear.X * SLANT_SCALE, Y = skin.barShear.Y * SLANT_SCALE}
        local fs = {X = skin.frameShear.X * SLANT_SCALE, Y = skin.frameShear.Y * SLANT_SCALE}
        pcall(function() target:SetRenderShear(bs) end)
        if valid(o.frame) then pcall(function() o.frame:SetRenderShear(fs) end) end
    end
    pcall(function() o.bar:SetFillColorAndOpacity(o.color) end)
    if valid(o.frame) then
        pcall(function() o.frame:SetVisibility(VIS_SHOWN) end)
        if skin and skin.frameColor then
            local c = skin.frameColor
            local col = {R = c.R * BORDER_DARKEN, G = c.G * BORDER_DARKEN, B = c.B * BORDER_DARKEN, A = c.A}
            pcall(function() o.frame:SetColorAndOpacity(col) end)
        end
    end
    if o.shade then FinishBar(o.shade) end
end

local function SetPct(o, p)
    if o and o.shade then SetPct(o.shade, p) end
    if not (o and valid(o.bar)) then return end
    if p < 0 then p = 0 elseif p > 1 then p = 1 end
    if math.abs(p - o.lastPct) < 0.0005 then return end
    local ok, err = pcall(function() o.bar:SetPercent(p) end)
    if ok then o.lastPct = p else logOnce("setpct" .. o.tag, "ERROR SetPercent: " .. tostring(err)) end
end

local function SetShown(o, s)
    if o and o.shade then SetShown(o.shade, s) end
    if not (o and valid(o.widget)) or o.shown == s then return end
    local ok = pcall(function() o.widget:SetVisibility(s and VIS_SHOWN or VIS_HIDDEN) end)
    if ok then o.shown = s end
end

-- ---------------------------------------------------------------- layout

local function PlaceLabel()
    if not valid(label) then return end
    -- Main widget's bottom-middle is at (POS_X, POS_Y): its left edge is POS_X - SIZE_X/2 and
    -- the bar's top edge is POS_Y - SIZE_Y. Label's bottom-left sits there, dipping into the bar.
    local lineH = math.floor(TEXT_SIZE * 1.35 + 0.5)
    local x = POS_X - math.floor(SIZE_X / 2) + TEXT_INDENT
    local y = POS_Y - SIZE_Y + TEXT_OVERLAP
    local ok, err = pcall(function()
        label:SetPositionInViewport({X = x, Y = y}, false)
        label:SetDesiredSizeInViewport({X = SIZE_X, Y = lineH})
        label:SetAnchorsInViewport({Minimum = {X = ANCHOR.X, Y = ANCHOR.Y}, Maximum = {X = ANCHOR.X, Y = ANCHOR.Y}})
        label:SetAlignmentInViewport({X = 0, Y = 1})
    end)
    if not ok then logOnce("plab", "ERROR PlaceLabel: " .. tostring(err)) end
end

local function ShieldTextSize()
    local h = math.floor(BAR_H * SHIELD_H_FRAC + 0.5)
    return math.max(10, math.floor(h * 0.85 + 0.5))
end

-- Shield number sits ON the shield bar: left-aligned, vertically centred.
local function PlaceShieldLabel()
    if not (valid(sLabel) and shieldBar and shieldBar.top) then return end
    local lineH = math.floor(ShieldTextSize() * 1.35 + 0.5)
    local x = POS_X - math.floor(shieldBar.w / 2) + TEXT_INDENT
    local y = shieldBar.top + math.floor(shieldBar.h / 2) - SHIELD_TEXT_RAISE
    local ok, err = pcall(function()
        sLabel:SetPositionInViewport({X = x, Y = y}, false)
        sLabel:SetDesiredSizeInViewport({X = shieldBar.w, Y = lineH})
        sLabel:SetAnchorsInViewport({Minimum = {X = ANCHOR.X, Y = ANCHOR.Y}, Maximum = {X = ANCHOR.X, Y = ANCHOR.Y}})
        sLabel:SetAlignmentInViewport({X = 0, Y = 0.5})
    end)
    if not ok then logOnce("pslab", "ERROR PlaceShieldLabel: " .. tostring(err)) end
end

local function Place()
    if not (mainBar and valid(mainBar.widget)) then return end
    mainBar.w = SIZE_X
    LayoutBar(mainBar, POS_X, POS_Y, 1.0)
    if shieldBar then
        shieldBar.w = math.floor(SIZE_X * SHIELD_W_FRAC + 0.5)
        -- top of the shield bar = bottom of the main bar + both frames' overhang + gap
        local mainBottom = POS_Y - SIZE_Y + BAR_H
        local gap = math.ceil(5.2 * BAR_H / 32 + 4.8 * shieldBar.h / 32) + SHIELD_GAP
        shieldBar.top = mainBottom + gap
        LayoutBar(shieldBar, POS_X, shieldBar.top, 0.0)
    end
    PlaceLabel()
    PlaceShieldLabel()
    log(string.format("POS_X, POS_Y = %d, %d   SIZE_X = %d", POS_X, POS_Y, SIZE_X))
end

-- ---------------------------------------------------------------- HP text

local function Commas(n)
    local s = string.format("%d", n)
    local k
    repeat s, k = s:gsub("^(-?%d+)(%d%d%d)", "%1,%2") until k == 0
    return s
end

local function SetLabel(s)
    if not valid(labelText) or s == lastText then return end
    local ok, err = pcall(function() labelText:SetText(FText(s)) end)
    if ok then lastText = s else logOnce("settext", "ERROR SetText: " .. tostring(err)) end
end

local function SetLabelShown(s)
    if not valid(label) or labelShown == s then return end
    if pcall(function() label:SetVisibility(s and VIS_SHOWN or VIS_HIDDEN) end) then labelShown = s end
end

-- Creates a text widget in the player's HP font. Font is written BEFORE AddToViewport.
local function MakeText(PC, Lib, size, z)
    local cls = StaticFindObject(TEXT_PATH)
    if not valid(cls) then
        pcall(function() LoadAsset(TEXT_ASSET) end)
        cls = StaticFindObject(TEXT_PATH)
    end
    if not valid(cls) then log("text class not found: " .. TEXT_PATH) return nil end

    local l = Lib:Create(PC, cls, PC)
    if not valid(l) then log("text Create failed") return nil end
    local okT, tb = pcall(function() return l.ChatLogLabelTextBlock end)
    if not (okT and valid(tb)) then log("ChatLogLabelTextBlock not readable: " .. tostring(tb)) return nil end

    local src = Template(SRC_TEXT)
    if src then
        local function set(name, fn)
            local ok, err = pcall(fn)
            if not ok then log("ERROR font." .. name .. ": " .. tostring(err)) end
        end
        set("FontObject", function() tb.Font.FontObject = src.Font.FontObject end)
        set("TypefaceFontName", function() tb.Font.TypefaceFontName = src.Font.TypefaceFontName end)
        set("OutlineSize", function() tb.Font.OutlineSettings.OutlineSize = src.Font.OutlineSettings.OutlineSize end)
        set("OutlineColor", function()
            local c = src.Font.OutlineSettings.OutlineColor
            tb.Font.OutlineSettings.OutlineColor = {R = c.R, G = c.G, B = c.B, A = c.A}
        end)
        set("ShadowOffset", function() local o = src.ShadowOffset tb.ShadowOffset = {X = o.X, Y = o.Y} end)
        set("ShadowColor", function()
            local c = src.ShadowColorAndOpacity
            tb.ShadowColorAndOpacity = {R = c.R, G = c.G, B = c.B, A = c.A}
        end)
    end
    pcall(function() tb.Font.Size = size end)

    l:AddToViewport(z)
    pcall(function() tb:SetJustification(0) end) -- ETextJustify::Left
    pcall(function() tb:SetColorAndOpacity({SpecifiedColor = TEXT_COLOR, ColorUseRule = 0}) end)
    return l, tb
end

local function CreateLabel(PC, Lib)
    if not SHOW_TEXT then return end
    local l, tb = MakeText(PC, Lib, TEXT_SIZE, 1000)
    if not l then return end
    label, labelText, lastText, labelShown = l, tb, nil, nil
    PlaceLabel()
end

local function CreateShieldLabel(PC, Lib)
    if not (SHIELD_TEXT and shieldBar) then return end
    local l, tb = MakeText(PC, Lib, ShieldTextSize(), 1000)
    if not l then return end
    sLabel, sLabelText, sLastText, sLabelShown = l, tb, nil, nil
    PlaceShieldLabel()
end

local function SetShieldLabel(s)
    if not valid(sLabelText) or s == sLastText then return end
    local ok, err = pcall(function() sLabelText:SetText(FText(s)) end)
    if ok then sLastText = s else logOnce("ssettext", "ERROR shield SetText: " .. tostring(err)) end
end

local function SetShieldLabelShown(s)
    if not valid(sLabel) or sLabelShown == s then return end
    if pcall(function() sLabel:SetVisibility(s and VIS_SHOWN or VIS_HIDDEN) end) then sLabelShown = s end
end

-- ---------------------------------------------------------------- create / destroy

local function DestroyAll()
    for _, o in ipairs({mainBar, shieldBar}) do
        if o and valid(o.widget) then pcall(function() o.widget:RemoveFromViewport() end) end
        local s = o and o.shade
        while s do        -- shading chain: highlight and shadow layers
            if valid(s.widget) then pcall(function() s.widget:RemoveFromViewport() end) end
            s = s.shade
        end
    end
    if valid(label) then pcall(function() label:RemoveFromViewport() end) end
    if valid(sLabel) then pcall(function() sLabel:RemoveFromViewport() end) end
    mainBar, shieldBar = nil, nil
    label, labelText, lastText, labelShown = nil, nil, nil, nil
    sLabel, sLabelText, sLastText, sLabelShown = nil, nil, nil, nil
end

local function CreateBar()
    if creating then return end
    creating = true
    errLogged = {}
    DestroyAll()

    local ok, err = pcall(function()
        local PCList = FindAllOf("ArchonPlayerController")
        local PC = PCList and PCList[1]
        if not valid(PC) then log("no PC") return end
        local cls = StaticFindObject(PATH)
        if not valid(cls) then
            pcall(function() LoadAsset(ASSET) end)
            cls = StaticFindObject(PATH)
        end
        if not valid(cls) then log("class not found: " .. PATH) return end
        local Lib = StaticFindObject("/Script/UMG.Default__WidgetBlueprintLibrary")
        if not valid(Lib) then log("library not found") return end

        local okS, eS = pcall(LoadSkin)
        if not okS then log("ERROR LoadSkin: " .. tostring(eS)) end

        -- z order: shield 995, its shading 996, main 997, its shading 998, texts 1000
        mainBar = NewBar(PC, Lib, cls, "main", SIZE_X, BAR_H, SIZE_Y, 997, FILL_COLOR)
        if not mainBar then return end
        -- Shading layers (widget box = same as its bar, so they sit on top of it), chained as
        -- bar.shade -> layer -> layer ..., so layout/percent/show calls follow the chain.
        -- Each layer's shear pivot sits at the BAR's vertical centre.
        local function addBands(o, tag, w, h, wh, z)
            local last = o
            local function link(s) if s then last.shade = s last = s end end
            for i = 1, SHADE_STEPS do
                -- highlight layer i: from the top, i/STEPS of the fade height
                local bh = math.max(1, math.floor(h * SHADE_FRAC * i / SHADE_STEPS + 0.5))
                local hi = NewBar(PC, Lib, cls, tag .. "Hi" .. i, w, bh, wh, z, SHADE_COLOR, true)
                if hi then hi.pivotY = (h / 2) / bh end
                link(hi)
                -- shadow layer i: from the bottom up
                local sb = math.max(1, math.floor(h * SHADOW_FRAC * i / SHADE_STEPS + 0.5))
                local lo = NewBar(PC, Lib, cls, tag .. "Lo" .. i, w, sb, wh, z, SHADOW_COLOR, true)
                if lo then
                    lo.offY = h - sb
                    lo.pivotY = (h / 2 - (h - sb)) / sb
                end
                link(lo)
            end
        end
        if SHADE then addBands(mainBar, "main", SIZE_X, BAR_H, SIZE_Y, 998) end
        if SHOW_SHIELD then
            local sh = math.floor(BAR_H * SHIELD_H_FRAC + 0.5)
            local sw = math.floor(SIZE_X * SHIELD_W_FRAC + 0.5)
            shieldBar = NewBar(PC, Lib, cls, "shield", sw, sh, sh, 995, SHIELD_COLOR)
            if shieldBar and SHADE then addBands(shieldBar, "shield", sw, sh, sh, 996) end
        end
        Place()
        FinishBar(mainBar)
        FinishBar(shieldBar)

        local okL, eL = pcall(CreateLabel, PC, Lib)
        if not okL then log("ERROR CreateLabel: " .. tostring(eL)) end
        local okL2, eL2 = pcall(CreateShieldLabel, PC, Lib)
        if not okL2 then log("ERROR CreateShieldLabel: " .. tostring(eL2)) end
        SetShieldLabelShown(false)

        SetPct(mainBar, 1.0)
        SetShown(mainBar, true)
        SetLabelShown(true)
        SetPct(shieldBar, 1.0)
        SetShown(shieldBar, false)
        log("bars ready")
    end)
    if not ok then log("ERROR CreateBar: " .. tostring(err)) end
    creating = false
end

-- ---------------------------------------------------------------- health / shield

local function ComputePct(hp, maxhp)
    if maxhp > HUGE_HP then
        return 1 - (maxhp - hp) / (maxhp * RANGE)
    end
    return hp / maxhp
end

local function PathOf(fullName)
    return fullName and fullName:match("^%S+%s+(.+)$")
end

-- The behemoth's ArchonHealthAttributeSet is one of its subobjects, so its path starts
-- with the behemoth's path followed by a dot.
local function AttrSetFor(key)
    local a = attrCache[key]
    if valid(a) then return a end
    attrCache[key] = nil
    local path = PathOf(key)
    if not path then return nil end
    local list = FindAllOf("ArchonHealthAttributeSet")
    if not list then return nil end
    for _, s in ipairs(list) do
        local okN, n = pcall(function() return s:GetFullName() end)
        local sp = okN and PathOf(n)
        if sp and sp:sub(1, #path + 1) == path .. "." then
            attrCache[key] = s
            log("attribute set for behemoth: " .. sp)
            return s
        end
    end
    logOnce("noattr" .. key, "no ArchonHealthAttributeSet found under " .. path)
    return nil
end

local function ReadF(obj, prop)
    local ok, v = pcall(function() return obj[prop] end)
    if ok and type(v) == "number" then return v end
    return nil
end

-- Returns current shield and max (the peak seen) - or nil when the behemoth has no shield.
local function ShieldFor(key)
    local a = AttrSetFor(key)
    if not a then return nil end
    local s = ReadF(a, "CurrentShield")
    if s and s > 0.5 and s > (shieldPeak[key] or 0) * SHIELD_MIN_FRAC then
        local peak = math.max(shieldPeak[key] or 0, s)
        shieldPeak[key] = peak
        if not shieldSrcLogged[key] then
            shieldSrcLogged[key] = true
            log(string.format("shield up (%.0f)", s))
        end
        return s, peak
    end
    shieldPeak[key], shieldSrcLogged[key] = nil, nil
    return nil
end

-- ---------------------------------------------------------------- bar sets
-- Escalations can have two behemoths at once. A SET is one full display (health bar, shield
-- bar, HP text, shield text). One living behemoth -> one set in the centre; two -> one on the
-- left and one on the right at the same height. The bar code above works on the globals
-- mainBar/shieldBar/label.../POS_X, so WithSet() swaps a set's widgets (and its x offset) into
-- those globals, runs the function, and stores them back.

local sets = {}

local function UseSet(s)
    mainBar, shieldBar = s.mainBar, s.shieldBar
    label, labelText, lastText, labelShown = s.label, s.labelText, s.lastText, s.labelShown
    sLabel, sLabelText, sLastText, sLabelShown = s.sLabel, s.sLabelText, s.sLastText, s.sLabelShown
end

local function SaveSet(s)
    s.mainBar, s.shieldBar = mainBar, shieldBar
    s.label, s.labelText, s.lastText, s.labelShown = label, labelText, lastText, labelShown
    s.sLabel, s.sLabelText, s.sLastText, s.sLabelShown = sLabel, sLabelText, sLastText, sLabelShown
end

local function WithSet(s, fn, ...)
    UseSet(s)
    local base = POS_X
    POS_X = base + (s.dx or 0)
    local ok, err = pcall(fn, ...)
    POS_X = base
    SaveSet(s)
    if not ok then logOnce("withset" .. tostring(fn), "ERROR in bar set: " .. tostring(err)) end
end

local function SetAlive(s) return s.mainBar and valid(s.mainBar.widget) end

-- Show one behemoth (t = {key, hp, maxhp}) on the CURRENT globals.
local function ShowTarget(t)
    local showText = ModSettings.Get("bhb_text", true)
    SetShown(mainBar, true)
    SetLabelShown(showText)
    SetPct(mainBar, ComputePct(t.hp, t.maxhp))
    SetLabel(Commas(math.max(0, math.ceil(t.hp))) .. "/" .. Commas(math.floor(t.maxhp + 0.5)))
    if shieldBar then
        local okS, cur, mx = false, nil, nil
        if ModSettings.Get("bhb_shield", true) then okS, cur, mx = pcall(ShieldFor, t.key) end
        if okS and cur and mx and mx > 0 then
            SetShown(shieldBar, true)
            SetPct(shieldBar, cur / mx)
            SetShieldLabelShown(showText)
            SetShieldLabel(Commas(math.max(0, math.ceil(cur))) .. "/" .. Commas(math.floor(mx + 0.5)))
        else
            if not okS and cur ~= nil then logOnce("shielderr", "ERROR ShieldFor: " .. tostring(cur)) end
            SetShown(shieldBar, false)
            SetShieldLabelShown(false)
        end
    end
end

local function ShowNone()
    SetShown(mainBar, false)
    SetLabelShown(false)
    SetShown(shieldBar, false)
    SetShieldLabelShown(false)
end

local function PlaceAll()
    for _, s in ipairs(sets) do
        if SetAlive(s) then WithSet(s, Place) end
    end
end

local function UpdateSets()
    -- every behemoth with readable health; the living ones separately
    local list = FindAllOf("ArchonBehemoth")
    local seen, alive = {}, {}
    if list then
        for _, b in ipairs(list) do
            if valid(b) then
                local ok, hp, maxhp = pcall(function() return b:GetCurrentHealth(), b:GetMaxHealth() end)
                local okN, key = pcall(function() return b:GetFullName() end)
                if ok and okN and hp and maxhp and maxhp > 0 then
                    local d = {key = key, hp = hp, maxhp = maxhp}
                    seen[key] = d
                    if hp > 0 then alive[#alive + 1] = d end
                    local prev = lastHealth[key]
                    if prev ~= nil and math.abs(prev - hp) > 0.01 then targetKey = key end
                    lastHealth[key] = hp
                end
            end
        end
    end
    for k in pairs(lastHealth) do
        if not seen[k] then
            lastHealth[k], attrCache[k], shieldPeak[k], shieldSrcLogged[k] = nil, nil, nil, nil
        end
    end

    -- what to show: two living behemoths -> both (stable left/right order by name);
    -- otherwise the most recently damaged one (or the first found)
    local targets = {}
    if ModSettings.Get("bhb_dual", true) and #alive >= 2 then
        table.sort(alive, function(a, b) return a.key < b.key end)
        targets = {alive[1], alive[2]}
    else
        local t = (targetKey and seen[targetKey]) or alive[1]
        if not t then for _, d in pairs(seen) do t = d break end end
        if t then targets = {t} end
    end
    if targets[1] then targetKey = targets[1].key end

    local half = math.floor(SIZE_X / 2 + DUAL_GAP / 2 + 0.5)
    for i, t in ipairs(targets) do
        local s = sets[i]
        if not s then s = {} sets[i] = s end
        local dx = (#targets == 2) and (i == 1 and -half or half) or 0
        if not SetAlive(s) then
            -- create at most once every ~5 s per set if it keeps failing
            s.wait = (s.wait or 0) - 1
            if s.wait <= 0 then
                s.wait = 20
                s.dx = dx
                log("creating bar set " .. i .. (dx ~= 0 and (dx < 0 and " (left)" or " (right)") or " (centre)"))
                WithSet(s, CreateBar)
            end
        elseif s.dx ~= dx then
            s.dx = dx
            WithSet(s, Place)
        end
        if SetAlive(s) then WithSet(s, ShowTarget, t) end
    end
    for i = #targets + 1, #sets do
        if SetAlive(sets[i]) then WithSet(sets[i], ShowNone) end
    end
end

-- ---------------------------------------------------------------- loop / keys

-- Hot reload (Ctrl+R) restarts this script but leaves old widgets on screen. Ours were added
-- straight to the viewport; the game's own copies live inside other widgets. Widgets of the
-- other mods are tagged with RenderOpacity 0.99x (tracker 0.996, mod menu 0.997)
-- and skipped; ours are untagged (opacity 1).
local function RemoveOld(className)
    local list = FindAllOf(className)
    local n = 0
    if list then
        for _, w in ipairs(list) do
            local okV, inVp = pcall(function() return w:IsInViewport() end)
            local okO, op = pcall(function() return w.RenderOpacity end)
            local tagged = okO and type(op) == "number" and op < 0.9995 and op > 0.99
            if okV and inVp and not tagged then
                if pcall(function() w:RemoveFromViewport() end) then n = n + 1 end
            end
        end
    end
    if n > 0 then log("removed " .. n .. " old " .. className .. " from a previous load") end
end

pcall(function()
    ExecuteInGameThread(function()
        pcall(RemoveOld, "StackableProgressBar_C")
        pcall(RemoveOld, "w_chat_log_label_bpw_C")
    end)
end)

FrameTick.Every(1, "settings", ModSettings.Load)
FrameTick.Every(0.25, "main", function()
    local ok, err = pcall(UpdateSets)
    if not ok then logOnce("loop", "ERROR loop: " .. tostring(err)) end
end)
FrameTick.Start(log, "BehemothHealthBars")

-- Keys act on every bar set (bars are created automatically when a behemoth is present).
RegisterKeyBind(Key.F7, function() POS_X = POS_X - STEP PlaceAll() end)
RegisterKeyBind(Key.F8, function() POS_X = POS_X + STEP PlaceAll() end)
RegisterKeyBind(Key.F9, function() POS_Y = POS_Y - STEP PlaceAll() end)
RegisterKeyBind(Key.F10, function() POS_Y = POS_Y + STEP PlaceAll() end)
RegisterKeyBind(Key.F11, function() SIZE_X = math.max(80, SIZE_X - WSTEP) PlaceAll() end)
RegisterKeyBind(Key.F12, function() SIZE_X = SIZE_X + WSTEP PlaceAll() end)

log("loaded (bars appear automatically when a behemoth is present)")
