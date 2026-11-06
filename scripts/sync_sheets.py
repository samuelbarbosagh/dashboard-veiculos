"""
Script de sincronização de dados do Google Sheets com o repositório GitHub.
Lê as abas ST9, FICHA e CADASTRO TT8 PROTHEUS via Service Account ou arquivo local,
consolida os dados em data/vehicles.json.
"""

import os
import json
import sys

# Bibliotecas opcionais carregadas com fallback seguro
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    import gspread
    from google.oauth2.service_account import Credentials
except ImportError:
    gspread = None

SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID")
GCP_SA_KEY = os.environ.get("GCP_SA_KEY")
OUTPUT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "vehicles.json")

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly"
]

def get_sheets_client():
    if not GCP_SA_KEY:
        print("[AVISO] GCP_SA_KEY não encontrada nas variáveis de ambiente.")
        return None
    
    if not gspread:
        print("[AVISO] Pacote gspread não instalado. Execute: pip install gspread google-auth")
        return None

    try:
        if os.path.exists(GCP_SA_KEY):
            creds = Credentials.from_service_account_file(GCP_SA_KEY, scopes=SCOPES)
        else:
            key_data = json.loads(GCP_SA_KEY)
            creds = Credentials.from_service_account_info(key_data, scopes=SCOPES)
        
        client = gspread.authorize(creds)
        return client
    except Exception as e:
        print(f"[ERRO] Falha ao autenticar com a Service Account: {e}")
        return None

def sync():
    print("Iniciando processo de sincronização...")
    
    if not SPREADSHEET_ID:
        print("[AVISO] SPREADSHEET_ID não informado. Mantendo dados atuais do repositório.")
        return

    client = get_sheets_client()
    if not client:
        print("[INFO] Execução sem conexão direta à API. Mantendo base existente.")
        return

    try:
        print(f"[INFO] Acessando planilha ID: {SPREADSHEET_ID} via Service Account...")
        sh = client.open_by_key(SPREADSHEET_ID)

        # 1. Carrega dados de Chassi e Série do TT8 Protheus
        chassis_map = {}
        try:
            tt8_sheet = sh.worksheet("CADASTRO TT8 PROTHEUS")
            tt8_rows = tt8_sheet.get_all_values()
            if tt8_rows:
                h = tt8_rows[0]
                bem_idx = h.index("Bem")
                chassi_idx = h.index("CHASSI")
                serie_idx = h.index("SÉRIE")
                for r in tt8_rows[1:]:
                    if len(r) > max(bem_idx, chassi_idx, serie_idx):
                        b = r[bem_idx].strip().upper()
                        if b:
                            chassis_map[b] = {
                                "chassi": r[chassi_idx].strip(),
                                "serie": r[serie_idx].strip()
                            }
                print(f"[OK] {len(chassis_map)} registros carregados de CADASTRO TT8 PROTHEUS")
        except Exception as e:
            print(f"[AVISO] Não foi possível ler CADASTRO TT8 PROTHEUS: {e}")

        # 2. Carrega ST9 (Cadastro do Bem e Horímetros)
        st9_sheet = sh.worksheet("ST9")
        st9_records = st9_sheet.get_all_records()
        print(f"[OK] {len(st9_records)} registros carregados de ST9")

        vehicles = {}
        for row in st9_records:
            bem = str(row.get("Bem", "")).strip().upper()
            if not bem:
                continue

            serie = str(row.get("Série", "")).strip()
            chassi = ""
            if bem in chassis_map:
                if not serie or serie == "1":
                    serie = chassis_map[bem]["serie"] or serie
                chassi = chassis_map[bem]["chassi"]

            placa = str(row.get("Placa", "") or bem).strip().upper()
            vehicles[bem] = {
                "filial": str(row.get("Filial", "")).strip(),
                "bem": bem,
                "placa": placa,
                "chassi": chassi,
                "serie": serie,
                "tipo_modelo": str(row.get("Tipo Modelo", "")).strip(),
                "fabricante": str(row.get("Fabricante", "")).strip(),
                "familia": str(row.get("Família", "")).strip(),
                "nome_bem": str(row.get("Nome do Bem", "")).strip(),
                "status_bem": str(row.get("Status Bem", "")).strip(),
                "situacao_bem": str(row.get("Situação Bem", "")).strip(),
                "centro_custo": str(row.get("Centro Custo", "")).strip(),
                "modelo": str(row.get("Modelo", "")).strip(),
                "tipo_contador": str(row.get("Tipo Cont.", "")).strip(),
                "pos_contador": str(row.get("Pos.Contador", "")).strip(),
                "ult_acomp": str(row.get("Últ. Acomp.", "")).strip(),
                "abastecimentos_count": 0,
                "total_litros": 0.0,
                "historico": []
            }

        # 3. Carrega Ficha de Aparecida (Abastecimentos)
        try:
            ficha_sheet = sh.worksheet("FICHA_0501_APARECIDA")
            ficha_rows = ficha_sheet.get_all_values()
            
            # Header starts around row 3-4
            header_idx = None
            for idx, r in enumerate(ficha_rows[:10]):
                if "PLACA" in r:
                    header_idx = idx
                    h = r
                    break

            if header_idx is not None:
                for r in ficha_rows[header_idx + 1:]:
                    if len(r) < 15:
                        continue
                    dt = r[0].strip()
                    if not dt or not dt[:2].isdigit():
                        continue
                    placa = r[3].strip().upper()
                    if not placa:
                        continue

                    try:
                        litros = float(r[10].replace(".", "").replace(",", "."))
                    except:
                        litros = 0.0

                    comb = r[9].strip()
                    motorista = r[8].strip()
                    km_abast = r[6].strip()
                    horimetro = r[7].strip()
                    km_l = r[18].strip() if len(r) > 18 else ""
                    l_h = r[19].strip() if len(r) > 19 else ""
                    frentista = r[13].strip() if len(r) > 13 else ""

                    if placa not in vehicles:
                        chassi = chassis_map.get(placa, {}).get("chassi", "")
                        serie = chassis_map.get(placa, {}).get("serie", "")
                        vehicles[placa] = {
                            "filial": "0501",
                            "bem": placa,
                            "placa": placa,
                            "chassi": chassi,
                            "serie": serie,
                            "tipo_modelo": r[4].strip() if len(r) > 4 else "",
                            "fabricante": "",
                            "familia": "",
                            "nome_bem": r[5].strip() if len(r) > 5 else "",
                            "status_bem": "Não listado em ST9",
                            "situacao_bem": "Ativo (Ficha)",
                            "centro_custo": r[22].strip() if len(r) > 22 else "",
                            "modelo": r[5].strip() if len(r) > 5 else "",
                            "tipo_contador": "HORIMETRO" if horimetro not in ("", "NT") else "ODOMETRO",
                            "pos_contador": horimetro if horimetro not in ("", "NT") else km_abast,
                            "ult_acomp": dt,
                            "abastecimentos_count": 0,
                            "total_litros": 0.0,
                            "historico": []
                        }

                    v = vehicles[placa]
                    v["abastecimentos_count"] += 1
                    v["total_litros"] = round(v["total_litros"] + litros, 2)
                    if len(v["historico"]) < 20:
                        v["historico"].append({
                            "data": dt,
                            "combustivel": comb,
                            "litros": litros,
                            "horimetro": horimetro,
                            "km": km_abast,
                            "km_l": km_l,
                            "l_h": l_h,
                            "motorista": motorista,
                            "frentista": frentista
                        })
                print(f"[OK] Ficha de Aparecida processada com sucesso.")
        except Exception as e:
            print(f"[AVISO] Erro ao ler aba de abastecimentos: {e}")

        # Salva o resultado final consolidado
        os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
        with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
            json.dump(list(vehicles.values()), f, ensure_ascii=False, indent=2)

        print(f"[SUCESSO] Base consolidada com {len(vehicles)} veículos gravada em: {OUTPUT_PATH}")

    except Exception as e:
        print(f"[ERRO GERAL] Falha no fluxo de sincronização: {e}")

if __name__ == "__main__":
    sync()
