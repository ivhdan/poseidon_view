"""
Poseidon View - temperatura superficiale del Mediterraneo, oggi e 9 giorni di previsione.

Gira ogni mattina nella GitHub Action insieme alle correnti. Scarica dal modello
Copernicus MEDSEA_ANALYSISFORECAST_PHY_006_013 la temperatura potenziale
(thetao) al primo livello (circa 1 m) e scrive data/temperatura/AAAA-MM-GG.json
piu' data/temperatura/index.json.

Uso:  python scripts/temperatura.py [--giorni 10] [--fattore 2] [--out data/temperatura]
"""

import argparse
import datetime as dt
import json
import math
from pathlib import Path

import numpy as np

from correnti import AREA, alleggerisci, maschera_atlantico

DATASET = "cmems_mod_med_phy-tem_anfc_4.2km_P1D-m"


def scarica(giorni):
    import copernicusmarine

    oggi = dt.datetime.now(dt.timezone.utc).date()
    fine = oggi + dt.timedelta(days=giorni - 1)
    ds = copernicusmarine.open_dataset(
        dataset_id=DATASET,
        variables=["thetao"],
        start_datetime=f"{oggi}T00:00:00",
        end_datetime=f"{fine}T23:59:59",
        minimum_depth=0.0,
        maximum_depth=2.0,
        **AREA,
    )
    if "depth" in ds.dims:
        ds = ds.isel(depth=0)
    return ds


def codifica(t, lon, lat, data):
    """Temperatura in decimi di grado interi (245 = 24,5 gradi C); null su terra."""
    lon = np.asarray(lon, dtype="float64")
    lat = np.asarray(lat, dtype="float64")
    t = np.where(maschera_atlantico(lon, lat), np.nan, np.asarray(t, dtype="float64"))
    dieci = np.round(t * 10.0)
    valori = [None if math.isnan(x) else int(x) for x in dieci.ravel()]
    return {
        "data": data,
        "unita": "0.1 C",
        "lon0": round(float(lon[0]), 5),
        "lat0": round(float(lat[0]), 5),
        "dlon": round(float(np.median(np.diff(lon))), 6),
        "dlat": round(float(np.median(np.diff(lat))), 6),
        "nx": int(lon.size),
        "ny": int(lat.size),
        "tmin": round(float(np.nanmin(t)), 1),
        "tmax": round(float(np.nanmax(t)), 1),
        "t": valori,
    }


def scrivi(ds, out):
    out.mkdir(parents=True, exist_ok=True)
    giorni = []
    for tempo in ds["time"].values:
        data = str(np.datetime_as_string(tempo, unit="D"))
        campo = codifica(ds["thetao"].sel(time=tempo).values,
                         ds["longitude"].values, ds["latitude"].values, data)
        nome = f"{data}.json"
        (out / nome).write_text(json.dumps(campo, separators=(",", ":")))
        giorni.append({"data": data, "file": nome, "tmin": campo["tmin"], "tmax": campo["tmax"]})
        print(f"  {nome}: {campo['nx']}x{campo['ny']} celle, {campo['tmin']}..{campo['tmax']} C")

    validi = {g["file"] for g in giorni} | {"index.json"}
    for f in out.glob("*.json"):
        if f.name not in validi:
            f.unlink()

    indice = {
        "aggiornato": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "dataset": DATASET,
        "profondita_m": 1,
        "giorni": giorni,
    }
    (out / "index.json").write_text(json.dumps(indice, ensure_ascii=False, indent=1))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--giorni", type=int, default=10)
    p.add_argument("--fattore", type=int, default=2)
    p.add_argument("--out", default="data/temperatura")
    a = p.parse_args()

    print(f"Scarico {DATASET} per {a.giorni} giorni...")
    ds = alleggerisci(scarica(a.giorni), a.fattore)
    print(f"Griglia: {ds.sizes['longitude']} x {ds.sizes['latitude']}, {ds.sizes['time']} giorni")
    scrivi(ds, Path(a.out))
    print("Fatto.")


if __name__ == "__main__":
    main()
