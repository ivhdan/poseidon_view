"""
Elenca i dataset di alcuni prodotti Copernicus Marine con variabili e copertura
temporale. Serve solo per scegliere gli ID giusti: si lancia a mano dal workflow
"Scopri dataset" e si legge il log.
"""
import sys
import copernicusmarine

PRODOTTI = sys.argv[1:] or [
    "SST_MED_SST_L4_NRT_OBSERVATIONS_010_004",
    "MEDSEA_MULTIYEAR_PHY_006_004",
    "MEDSEA_ANALYSISFORECAST_PHY_006_013",
]

for pid in PRODOTTI:
    print(f"\n===== {pid}")
    cat = copernicusmarine.describe(product_id=pid, disable_progress_bar=True)
    for prod in cat.products:
        for ds in prod.datasets:
            for ver in ds.versions:
                for part in ver.parts:
                    vars_, tempo = set(), ""
                    for svc in part.services:
                        for var in svc.variables:
                            vars_.add(var.short_name)
                            for c in var.coordinates:
                                if c.coordinate_id == "time" and not tempo:
                                    lo = c.minimum_value
                                    hi = c.maximum_value
                                    tempo = f"{lo} -> {hi} step {c.step}"
                    print(f"{ds.dataset_id} | ver {ver.label} | part {part.name} | "
                          f"{sorted(vars_)} | {tempo}")
