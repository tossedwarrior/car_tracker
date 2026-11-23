# Draws the body-style outlines the home page shows for a car with no photo
# (public/outlines/*.svg), and prints their sizes and wheel positions for
# OUTLINES in src/lib/outlines.ts. Run after changing a shape, then copy the
# printed numbers across:
#
#   python3 scripts/draw-outlines.py public/outlines
#
# Every car faces left; the wheels have spokes so they visibly turn.
import json, math, sys
OUT = sys.argv[1]
W = 2400
C = dict(well="#17191b", body="#2c2f33", glass="#6b7882", light="#9aa3a9", tyre="#141414", rim="#c3c8cc", hub="#43484d", seat="#4a4f55")

def arch(cx, cy, r_arch, y):
    dx = math.sqrt(r_arch**2 - (y - cy)**2)
    return round(cx + dx), round(cx - dx)

def wheel(cx, cy, r):
    rim = r * 0.70
    spokes = []
    for k in range(5):
        a = math.radians(-90 + k * 72)
        x2, y2 = cx + math.cos(a) * rim * 0.92, cy + math.sin(a) * rim * 0.92
        spokes.append(f'<line x1="{cx}" y1="{cy}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{C["rim"]}" stroke-width="{r*0.17:.1f}" stroke-linecap="round"/>')
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{C["tyre"]}"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{rim:.1f}" fill="{C["hub"]}"/>'
            + "".join(spokes) +
            f'<circle cx="{cx}" cy="{cy}" r="{rim:.1f}" fill="none" stroke="{C["rim"]}" stroke-width="{r*0.07:.1f}"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r*0.15:.1f}" fill="{C["hub"]}" stroke="{C["rim"]}" stroke-width="{r*0.04:.1f}"/>')

def build(name, G, R, fx, rx, sill, top, upper, extras):
    cy = G - R
    ra = R * 1.11
    f1, f0 = arch(fx, cy, ra, sill)
    r1, r0 = arch(rx, cy, ra, sill)
    body = (f'M {upper[0]} ' + " ".join(upper[1:]) +
            f' L {r1} {sill} A {ra:.0f} {ra:.0f} 0 1 0 {r0} {sill} L {f1} {sill} A {ra:.0f} {ra:.0f} 0 1 0 {f0} {sill} Z')
    h = G - top
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{h}" viewBox="0 {top} {W} {h}">'
           f'<path d="M {f1} {sill} A {ra:.0f} {ra:.0f} 0 1 0 {f0} {sill} Z M {r1} {sill} A {ra:.0f} {ra:.0f} 0 1 0 {r0} {sill} Z" fill="{C["well"]}"/>'
           f'<path d="{body}" fill="{C["body"]}"/>' + "".join(e.format(**C) for e in extras) +
           wheel(fx, cy, R) + wheel(rx, cy, R) + '</svg>')
    open(f"{OUT}/{name}.svg", "w").write(svg)
    r4 = lambda v: round(v, 4)
    spec = {"width": W, "height": h, "wheels": {
        "front": {"x": r4(fx / W), "y": r4((cy - top) / h), "r": r4(R / W)},
        "rear": {"x": r4(rx / W), "y": r4((cy - top) / h), "r": r4(R / W)}}}
    return spec

specs = {}
NOSE = ["80 590", "C 40 578 32 485 108 445", "C 230 395 390 300 545 288", "C 680 282 770 295 850 305"]
HEADLIGHT = '<path d="M 118 446 C 200 410 285 378 360 366 L 338 398 C 265 410 195 428 128 462 Z" fill="{light}"/>'
TAIL = ["C 2380 400 2385 480 2358 545", "L 2340 590"]
TAILLIGHT = '<path d="M 2318 370 L 2368 398 L 2364 432 L 2310 410 Z" fill="{light}"/>'
# Low mid-engine coupe, facing left.
specs["coupe"] = build("coupe", G=640, R=165, fx=520, rx=1880, sill=590, top=165, upper=NOSE + [
    "C 970 225 1110 180 1310 175", "C 1500 172 1660 198 1840 248", "C 2000 262 2250 300 2335 360"] + TAIL,
    extras=[
    '<path d="M 890 306 C 1000 238 1120 200 1300 197 L 1335 197 L 1365 300 L 905 312 Z" fill="{glass}"/>',
    '<path d="M 1405 199 C 1505 200 1590 218 1690 252 L 1700 270 L 1425 298 Z" fill="{glass}"/>',
    '<path d="M 1700 420 C 1745 398 1790 392 1825 396 L 1795 468 L 1712 472 Z" fill="#24272b"/>',
    HEADLIGHT, TAILLIGHT])
# Convertible / spider: the same car with the roof off.
specs["convertible"] = build("convertible", G=640, R=165, fx=520, rx=1880, sill=590, top=228, upper=NOSE + [
    "L 1062 240", "C 1078 232 1100 232 1110 242", "L 1150 318", "L 1640 316", "C 1700 290 1760 262 1840 252",
    "C 2000 262 2250 300 2335 360"] + TAIL,
    extras=[
    '<path d="M 895 306 L 1060 252 L 1090 252 L 1120 312 Z" fill="{glass}"/>',
    '<path d="M 1380 318 C 1384 272 1400 250 1432 250 C 1455 250 1462 272 1458 318 Z" fill="{seat}"/>',
    '<path d="M 1220 318 C 1224 277 1238 257 1268 257 C 1290 257 1297 277 1293 318 Z" fill="{seat}"/>',
    HEADLIGHT, TAILLIGHT])
# SUV: tall, long flat roof.
specs["suv"] = build("suv", G=760, R=190, fx=540, rx=1880, sill=650, top=185, upper=[
    "70 650", "C 40 640 38 450 92 400", "C 230 345 420 318 600 312", "C 700 310 760 315 820 318",
    "C 880 270 960 222 1050 200", "L 1900 195", "C 2080 200 2200 230 2290 300", "C 2340 360 2350 520 2335 640",
    "L 2330 650"],
    extras=[
    '<path d="M 1092 213 L 1440 211 L 1440 330 L 960 334 C 1000 290 1040 245 1092 213 Z" fill="{glass}"/>',
    '<path d="M 1478 211 L 1820 209 L 1820 327 L 1478 330 Z" fill="{glass}"/>',
    '<path d="M 1858 209 C 2010 212 2110 241 2185 296 L 2175 323 L 1858 326 Z" fill="{glass}"/>',
    '<path d="M 98 408 C 190 370 280 350 360 346 L 342 380 C 260 386 180 398 108 425 Z" fill="{light}"/>',
    '<path d="M 2300 330 L 2345 360 L 2343 410 L 2296 390 Z" fill="{light}"/>'])
# Four-door sedan / GT, fastback.
specs["sedan"] = build("sedan", G=660, R=170, fx=540, rx=1870, sill=600, top=205, upper=[
    "70 600", "C 35 588 32 480 110 455", "C 230 402 400 322 560 316", "C 690 312 770 325 840 335",
    "C 960 270 1060 228 1210 215", "C 1450 205 1650 215 1800 250", "C 1950 275 2150 310 2290 345",
    "C 2350 362 2365 470 2345 560", "L 2335 600"],
    extras=[
    '<path d="M 880 338 C 975 278 1068 243 1210 232 L 1290 229 L 1295 318 L 900 342 Z" fill="{glass}"/>',
    '<path d="M 1325 228 C 1470 225 1610 233 1750 262 L 1765 282 L 1330 316 Z" fill="{glass}"/>',
    '<path d="M 120 462 C 205 420 285 390 360 380 L 340 412 C 268 422 198 440 130 476 Z" fill="{light}"/>',
    '<path d="M 2300 352 L 2352 372 L 2350 402 L 2296 387 Z" fill="{light}"/>'])
print(json.dumps(specs, indent=1))
