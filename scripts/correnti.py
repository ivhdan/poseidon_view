"""
Poseidon View - scarico delle correnti superficiali del Mediterraneo.

Gira ogni notte nella GitHub Action. Scarica dal modello Copernicus
MEDSEA_ANALYSISFORECAST_PHY_006_013 le componenti della corrente
(uo verso est, vo verso nord) al primo livello di profondita' (circa 1 m),
per oggi e i giorni di previsione successivi.

Per ogni giorno scrive data/correnti/AAAA-MM-GG.json con il campo
alleggerito su una griglia regolare, piu' data/correnti/index.json
con l'elenco dei giorni disponibili. Le credenziali arrivano dalle
variabili d'ambiente COPERNICUSMARINE_SERVICE_USERNAME / _PASSWORD.

Uso:  python scripts/correnti.py [--giorni 10] [--fattore 3] [--out data/correnti]
"""

import argparse
import datetime as dt
import json
import math
from pathlib import Path

import numpy as np

DATASET = "cmems_mod_med_phy-cur_anfc_4.2km_P1D-m"   # senza suffisso: ultima versione
AREA = dict(minimum_longitude=-6.0, maximum_longitude=36.5,
            minimum_latitude=30.0, maximum_latitude=46.0)


def scarica(giorni):
    """Apre il dataset remoto e restituisce uo/vo superficiali per i giorni richiesti."""
    import copernicusmarine

    oggi = dt.datetime.now(dt.timezone.utc).date()
    fine = oggi + dt.timedelta(days=giorni - 1)
    ds = copernicusmarine.open_dataset(
        dataset_id=DATASET,
        variables=["uo", "vo"],
        start_datetime=f"{oggi}T00:00:00",
        end_datetime=f"{fine}T23:59:59",
        minimum_depth=0.0,
        maximum_depth=2.0,                    # solo il primo livello (~1,02 m)
        **AREA,
    )
    if "depth" in ds.dims:
        ds = ds.isel(depth=0)
    return ds


def alleggerisci(ds, fattore):
    """Media su blocchi fattore x fattore celle (1/24 deg * 3 = 0,125 deg)."""
    ds = ds.sortby("latitude").sortby("longitude")
    if fattore > 1:
        ds = ds.coarsen(longitude=fattore, latitude=fattore, boundary="trim").mean()
    return ds.load()


def maschera_atlantico(lon, lat):
    """True dove la griglia cade in Atlantico (golfo di Biscaglia, oltre Gibilterra).

    Il dominio del modello include un pezzo di Atlantico che non e' Mediterraneo.
    """
    LON, LAT = np.meshgrid(np.asarray(lon), np.asarray(lat))
    return (LON < -5.6) | ((LAT > 42.0) & (LON < 1.0))


def codifica(u, v, lon, lat, data):
    """Campo di un giorno -> dizionario JSON compatto.

    Velocita' in cm/s intere; null sulla terra. Righe da sud a nord,
    colonne da ovest a est: indice = riga * nx + colonna.
    """
    def a_lista(a):
        a = np.round(np.asarray(a, dtype="float64") * 100.0)
        return [None if math.isnan(x) else int(x) for x in a.ravel()]

    lon = np.asarray(lon, dtype="float64")
    lat = np.asarray(lat, dtype="float64")

    atlantico = maschera_atlantico(lon, lat)
    u = np.where(atlantico, np.nan, u)
    v = np.where(atlantico, np.nan, v)
    passo_lon = float(np.median(np.diff(lon)))
    passo_lat = float(np.median(np.diff(lat)))
    velocita = np.hypot(u, v)

    return {
        "data": data,
        "unita": "cm/s",
        "lon0": round(float(lon[0]), 5),
        "lat0": round(float(lat[0]), 5),
        "dlon": round(passo_lon, 6),
        "dlat": round(passo_lat, 6),
        "nx": int(lon.size),
        "ny": int(lat.size),
        "vmax": round(float(np.nanmax(velocita)) * 100.0, 1),
        "u": a_lista(u),
        "v": a_lista(v),
    }


def scrivi(ds, out):
    out.mkdir(parents=True, exist_ok=True)
    giorni = []
    for t in ds["time"].values:
        data = str(np.datetime_as_string(t, unit="D"))
        giorno = ds.sel(time=t)
        campo = codifica(giorno["uo"].values, giorno["vo"].values,
                         ds["longitude"].values, ds["latitude"].values, data)
        nome = f"{data}.json"
        (out / nome).write_text(json.dumps(campo, separators=(",", ":")))
        giorni.append({"data": data, "file": nome, "vmax": campo["vmax"]})
        print(f"  {nome}: {campo['nx']}x{campo['ny']} celle, max {campo['vmax']} cm/s")

    # Toglie i giorni ormai passati
    validi = {g["file"] for g in giorni} | {"index.json"}
    for f in out.glob("*.json"):
        if f.name not in validi:
            f.unlink()
            print(f"  rimosso {f.name}")

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
    p.add_argument("--fattore", type=int, default=3)
    p.add_argument("--out", default="data/correnti")
    a = p.parse_args()

    print(f"Scarico {DATASET} per {a.giorni} giorni...")
    ds = alleggerisci(scarica(a.giorni), a.fattore)
    print(f"Griglia: {ds.sizes['longitude']} x {ds.sizes['latitude']}, {ds.sizes['time']} giorni")
    scrivi(ds, Path(a.out))
    print("Fatto.")


if __name__ == "__main__":
    main()
