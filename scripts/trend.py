"""
Poseidon View - temperatura media mensile del Mediterraneo dal 2000.

Gira una volta al mese nella GitHub Action. Per ogni mese calcola la media della
temperatura superficiale (primo livello, circa 1 m) su tutto il Mediterraneo,
pesata per l'area delle celle (coseno della latitudine), escludendo l'Atlantico.

Fonti, tutte Copernicus Marine:
  1. rianalisi MEDSEA_MULTIYEAR_PHY_006_004, medie mensili (fino a pochi mesi fa)
  2. analisi MEDSEA_ANALYSISFORECAST_PHY_006_013, medie mensili, solo per i mesi
     successivi all'ultimo mese della rianalisi

Scrive data/trend.json.

Uso:  python scripts/trend.py [--da 2000] [--out data/trend.json]
"""

import argparse
import datetime as dt
import json
from pathlib import Path

import numpy as np

from correnti import AREA, maschera_atlantico

RIANALISI = "cmems_mod_med_phy-temp_my_4.2km_P1M-m"
ANALISI = "cmems_mod_med_phy-tem_anfc_4.2km_P1M-m"


def medie_mensili(dataset_id, inizio, fine=None):
    """Serie {'AAAA-MM': gradi C} della media pesata sul bacino."""
    import copernicusmarine

    args = dict(dataset_id=dataset_id, variables=["thetao"],
                start_datetime=f"{inizio}-01T00:00:00",
                minimum_depth=0.0, maximum_depth=2.0, **AREA)
    if fine:
        args["end_datetime"] = f"{fine}T23:59:59"
    ds = copernicusmarine.open_dataset(**args)
    if "depth" in ds.dims:
        ds = ds.isel(depth=0)

    lon, lat = ds["longitude"].values, ds["latitude"].values
    mare_valido = ~maschera_atlantico(lon, lat)
    peso = np.cos(np.deg2rad(lat))[:, None] * np.ones((1, lon.size))
    peso = np.where(mare_valido, peso, 0.0)

    serie = {}
    # Un mese alla volta: memoria sotto controllo anche su 300+ mesi
    for t in ds["time"].values:
        campo = ds["thetao"].sel(time=t).values.astype("float64")
        ok = np.isfinite(campo) & (peso > 0)
        if not ok.any():
            continue
        media = float(np.sum(campo[ok] * peso[ok]) / np.sum(peso[ok]))
        mese = str(np.datetime_as_string(t, unit="M"))
        serie[mese] = round(media, 2)
        print(f"  {dataset_id[-20:]} {mese}: {media:.2f} C")
    return serie


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--da", type=int, default=2000)
    p.add_argument("--out", default="data/trend.json")
    a = p.parse_args()

    print(f"Rianalisi {RIANALISI} dal {a.da}...")
    serie = medie_mensili(RIANALISI, f"{a.da}-01")
    fonti = {"rianalisi": RIANALISI}

    if serie:
        ultimo = max(serie)
        anno, mese = map(int, ultimo.split("-"))
        dopo = f"{anno + (mese == 12)}-{mese % 12 + 1:02d}"
        try:
            print(f"Analisi {ANALISI} dal {dopo}...")
            extra = medie_mensili(ANALISI, dopo)
            nuovi = {k: v for k, v in extra.items() if k > ultimo}
            if nuovi:
                serie.update(nuovi)
                fonti["analisi"] = ANALISI
                fonti["analisi_dal"] = min(nuovi)
        except Exception as e:                       # la rianalisi basta da sola
            print(f"  analisi non disponibile: {e}")

    mesi = sorted(serie)
    if not mesi:
        raise SystemExit("Nessun dato scaricato.")

    # Serie continua dal primo mese: null per eventuali buchi
    a0, m0 = map(int, mesi[0].split("-"))
    a1, m1 = map(int, mesi[-1].split("-"))
    n = (a1 - a0) * 12 + (m1 - m0) + 1
    valori = []
    for k in range(n):
        y, m = a0 + (m0 - 1 + k) // 12, (m0 - 1 + k) % 12 + 1
        valori.append(serie.get(f"{y}-{m:02d}"))

    out = {
        "aggiornato": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "descrizione": "Temperatura media mensile del mare in superficie (~1 m), "
                       "Mediterraneo, media pesata per area",
        "unita": "C",
        "inizio": mesi[0],
        "fonti": fonti,
        "valori": valori,
    }
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"Scritti {n} mesi, da {mesi[0]} a {mesi[-1]}.")


if __name__ == "__main__":
    main()
