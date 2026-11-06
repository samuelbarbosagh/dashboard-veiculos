#!/usr/bin/env python3
"""
Consolida os dados completos das abas:
- ST9 + CADASTRO TT8 PROTHEUS (base de 1.051+ veículos)
- FICHA_0501_APARECIDA, FICHA_0201_UBERABA, FICHA_0104_LONDRINA, FICHA_0103_BH, FICHA_0107_UNAI, FICHA_0105 CALDAS NOVAS
- PORTAL Almoxarifado (Aplicativo Mobile / Portal)
- INDICADORES e DASHBOARD (todos os 20 quadros analíticos e séries dos 23 gráficos executivos)
Gera:
- data/vehicles.json (enriquecido com indicadores paralelos Ficha vs. Aplicativo)
- data/indicadores.json (base auditável consolidada da guia Dashboard & Indicadores)
"""

import csv
import json
import os
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VEHICLES_JSON_PATH = os.path.join(BASE_DIR, "data", "vehicles.json")
INDICADORES_JSON_PATH = os.path.join(BASE_DIR, "data", "indicadores.json")


def parse_ptbr_float(val):
    if val is None:
        return 0.0
    s = str(val).strip()
    if not s or s in ("-", "NT", "S/ META CADASTRADA", "#DIV/0!", "#VALUE!", "#N/A"):
        return 0.0
    s = s.replace("R$", "").replace("%", "").strip()
    # Handle negative sign with spaces like "-R$ 10,55"
    s = s.replace(" ", "")
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_ptbr_int(val):
    if val is None:
        return 0
    s = str(val).strip()
    if not s or s in ("-", "NT", "S/ META CADASTRADA", "#DIV/0!", "#VALUE!", "#N/A"):
        return 0
    # In PT-BR, "5.196" or "1.775" is an integer with thousands separator
    if re.match(r"^-?\d{1,3}(\.\d{3})+$", s):
        return int(s.replace(".", ""))
    return int(round(parse_ptbr_float(s)))


def clean_cell(row, idx):
    if idx < len(row) and row[idx] is not None:
        return str(row[idx]).strip()
    return ""


def normalize_plate(raw):
    if not raw:
        return ""
    return re.sub(r"[\s\-_.]", "", str(raw).strip().upper())


def build_indicadores():
    with open("/tmp/indicadores_full.json", "r", encoding="utf-8") as f:
        rows = json.load(f)

    # 1. Meta & Global KPIs (Rows 3 and 5 -> 0-indexed: 2 and 4)
    r_meta = rows[2] if len(rows) > 2 else []
    r_kpis = rows[4] if len(rows) > 4 else []

    # 1. Desempenho Geral e Governança por Filial (Rows 9-15 -> 0-indexed 8..14)
    desempenho_filiais = []
    total_rede_desempenho = None
    for idx in range(8, 15):
        r = rows[idx]
        cod = clean_cell(r, 0)
        if not cod:
            continue
        item = {
            "cod_filial": cod,
            "nome_filial": clean_cell(r, 1),
            "abastecimentos": parse_ptbr_int(clean_cell(r, 2)),
            "abastecimentos_fmt": clean_cell(r, 2),
            "veiculos_distintos": parse_ptbr_int(clean_cell(r, 3)),
            "veiculos_distintos_fmt": clean_cell(r, 3),
            "volume_fichas": parse_ptbr_float(clean_cell(r, 4)),
            "volume_fichas_fmt": clean_cell(r, 4),
            "part_fichas_pct": parse_ptbr_float(clean_cell(r, 5)),
            "part_fichas_fmt": clean_cell(r, 5),
            "total_km": parse_ptbr_float(clean_cell(r, 6)),
            "total_km_fmt": clean_cell(r, 6),
            "total_horas": parse_ptbr_float(clean_cell(r, 7)),
            "total_horas_fmt": clean_cell(r, 7),
            "taxa_eficiencia_app_pct": parse_ptbr_float(clean_cell(r, 8)) * (100.0 if clean_cell(r, 8) == "1" else 1.0),
            "taxa_eficiencia_app_fmt": "100,00%" if clean_cell(r, 8) == "1" else clean_cell(r, 8),
            "taxa_consistencia_pct": parse_ptbr_float(clean_cell(r, 9)) * (100.0 if clean_cell(r, 9) == "1" else 1.0),
            "taxa_consistencia_fmt": "100,00%" if clean_cell(r, 9) == "1" else clean_cell(r, 9),
            "taxa_adesao_portal_pct": parse_ptbr_float(clean_cell(r, 10)) * (100.0 if clean_cell(r, 10) == "1" else 1.0),
            "taxa_adesao_portal_fmt": "100,00%" if clean_cell(r, 10) == "1" else clean_cell(r, 10),
            "saldo_km_l": parse_ptbr_float(clean_cell(r, 11)),
            "saldo_km_l_fmt": clean_cell(r, 11),
            "saldo_l_h": parse_ptbr_float(clean_cell(r, 12)),
            "saldo_l_h_fmt": clean_cell(r, 12),
            "placa_maior_consumidor": clean_cell(r, 13),
            "volume_maior_consumidor": parse_ptbr_float(clean_cell(r, 14)),
            "volume_maior_consumidor_fmt": clean_cell(r, 14),
            "frentistas_ativos": parse_ptbr_int(clean_cell(r, 15)),
            "volume_portal": parse_ptbr_float(clean_cell(r, 16)),
            "volume_portal_fmt": clean_cell(r, 16),
            "part_portal_pct": parse_ptbr_float(clean_cell(r, 17)),
            "part_portal_fmt": clean_cell(r, 17),
        }
        if "TOTAL" in cod.upper():
            total_rede_desempenho = item
        else:
            desempenho_filiais.append(item)

    # 2. Eficiência Energética por Matriz de Combustível (Rows 19-25 -> 0-indexed 18..24)
    eficiencia_combustivel = []
    total_rede_eficiencia = None
    for idx in range(18, 25):
        r = rows[idx]
        cod = clean_cell(r, 0)
        if not cod:
            continue
        item = {
            "cod_filial": cod,
            "nome_filial": clean_cell(r, 1),
            "diesel_km": parse_ptbr_float(clean_cell(r, 2)),
            "diesel_km_fmt": clean_cell(r, 2) or "0,00",
            "diesel_horas": parse_ptbr_float(clean_cell(r, 3)),
            "diesel_horas_fmt": clean_cell(r, 3) or "0,00",
            "diesel_litros": parse_ptbr_float(clean_cell(r, 4)),
            "diesel_litros_fmt": clean_cell(r, 4) or "0,00",
            "diesel_media_abast": parse_ptbr_float(clean_cell(r, 5)),
            "diesel_media_abast_fmt": clean_cell(r, 5) or "0,00",
            "diesel_efic_km_l": parse_ptbr_float(clean_cell(r, 6)),
            "diesel_efic_km_l_fmt": clean_cell(r, 6) or "0,00",
            "diesel_efic_l_h": parse_ptbr_float(clean_cell(r, 7)),
            "diesel_efic_l_h_fmt": clean_cell(r, 7) or "0,00",
            "gasolina_km": parse_ptbr_float(clean_cell(r, 8)),
            "gasolina_km_fmt": clean_cell(r, 8) or "0,00",
            "gasolina_horas": parse_ptbr_float(clean_cell(r, 9)),
            "gasolina_horas_fmt": clean_cell(r, 9) or "0,00",
            "gasolina_litros": parse_ptbr_float(clean_cell(r, 10)),
            "gasolina_litros_fmt": clean_cell(r, 10) or "0,00",
            "gasolina_media_abast": parse_ptbr_float(clean_cell(r, 11)),
            "gasolina_media_abast_fmt": clean_cell(r, 11) or "0,00",
            "gasolina_efic_km_l": parse_ptbr_float(clean_cell(r, 12)),
            "gasolina_efic_km_l_fmt": clean_cell(r, 12) or "0,00",
            "gasolina_efic_l_h": parse_ptbr_float(clean_cell(r, 13)),
            "gasolina_efic_l_h_fmt": clean_cell(r, 13) or "0,00",
            "arla_km": parse_ptbr_float(clean_cell(r, 14)),
            "arla_km_fmt": clean_cell(r, 14) or "0,00",
            "arla_horas": parse_ptbr_float(clean_cell(r, 15)),
            "arla_horas_fmt": clean_cell(r, 15) or "0,00",
            "arla_litros": parse_ptbr_float(clean_cell(r, 16)),
            "arla_litros_fmt": clean_cell(r, 16) or "0,00",
            "arla_media_abast": parse_ptbr_float(clean_cell(r, 17)),
            "arla_media_abast_fmt": clean_cell(r, 17) or "0,00",
            "arla_efic_km_l": parse_ptbr_float(clean_cell(r, 18)),
            "arla_efic_km_l_fmt": clean_cell(r, 18) or "0,00",
            "arla_efic_l_h": parse_ptbr_float(clean_cell(r, 19)),
            "arla_efic_l_h_fmt": clean_cell(r, 19) or "0,00",
        }
        if "TOTAL" in cod.upper():
            total_rede_eficiencia = item
        else:
            eficiencia_combustivel.append(item)

    # 3. Auditoria de Conciliação e Divergências (Rows 29-35 -> 0-indexed 28..34)
    auditoria_conciliacao = []
    total_rede_auditoria = None
    for idx in range(28, 35):
        r = rows[idx]
        cod = clean_cell(r, 0)
        if not cod:
            continue
        item = {
            "cod_filial": cod,
            "nome_filial": clean_cell(r, 1),
            "fichas_consistentes": parse_ptbr_int(clean_cell(r, 2)),
            "fichas_consistentes_fmt": clean_cell(r, 2),
            "fichas_inconsistentes": parse_ptbr_int(clean_cell(r, 3)),
            "fichas_inconsistentes_fmt": clean_cell(r, 3),
            "fichas_localizadas_portal": parse_ptbr_int(clean_cell(r, 4)),
            "fichas_localizadas_portal_fmt": clean_cell(r, 4),
            "fichas_nao_localizadas_portal": parse_ptbr_int(clean_cell(r, 5)),
            "fichas_nao_localizadas_portal_fmt": clean_cell(r, 5),
            "registros_portal_app": parse_ptbr_int(clean_cell(r, 6)),
            "registros_portal_app_fmt": clean_cell(r, 6),
            "portal_conciliado_ok": parse_ptbr_int(clean_cell(r, 7)),
            "portal_conciliado_ok_fmt": clean_cell(r, 7),
            "portal_pendente_divergente": parse_ptbr_int(clean_cell(r, 8)),
            "portal_pendente_divergente_fmt": clean_cell(r, 8),
            "portal_duplicados": parse_ptbr_int(clean_cell(r, 9)),
            "portal_duplicados_fmt": clean_cell(r, 9),
            "sa_pendente": parse_ptbr_int(clean_cell(r, 10)),
            "sa_pendente_fmt": clean_cell(r, 10),
            "saldo_fin_km_l": parse_ptbr_float(clean_cell(r, 11)),
            "saldo_fin_km_l_fmt": clean_cell(r, 11),
            "saldo_fin_l_h": parse_ptbr_float(clean_cell(r, 12)),
            "saldo_fin_l_h_fmt": clean_cell(r, 12),
        }
        if "TOTAL" in cod.upper():
            total_rede_auditoria = item
        else:
            auditoria_conciliacao.append(item)

    # 3b. Memória de Cálculo Auxiliar: Auditoria Empilhada Lado a Lado (Rows 29-40 -> 0-indexed 28..39, Cols 14-18)
    auditoria_empilhada = []
    for idx in range(28, 40):
        r = rows[idx]
        label = clean_cell(r, 14)
        if not label:
            continue
        auditoria_empilhada.append({
            "filial_tipo": label,
            "fichas_consistentes": parse_ptbr_int(clean_cell(r, 15)),
            "fichas_inconsistentes": parse_ptbr_int(clean_cell(r, 16)),
            "fichas_localizadas_portal": parse_ptbr_int(clean_cell(r, 17)),
            "fichas_nao_localizadas_portal": parse_ptbr_int(clean_cell(r, 18)),
        })

    # 4. Top 10 Veículos Maiores Consumidores da Rede (Rows 39-48, Cols 0-5)
    top10_maiores_consumidores = []
    for idx in range(38, 49):
        r = rows[idx]
        placa = clean_cell(r, 0)
        if not placa or placa == "Placa":
            continue
        top10_maiores_consumidores.append({
            "placa": placa,
            "equipamento": clean_cell(r, 1),
            "combustivel": clean_cell(r, 2),
            "qtd_abast": parse_ptbr_int(clean_cell(r, 3)),
            "total_litros": parse_ptbr_float(clean_cell(r, 4)),
            "total_litros_fmt": clean_cell(r, 4),
            "total_km": parse_ptbr_float(clean_cell(r, 5)),
            "total_km_fmt": clean_cell(r, 5),
        })

    # 5. Top 10 Maiores Ofensores de Desperdício - Saldo KM/L Negativo (Rows 39-48, Cols 7-12)
    top10_ofensores_desperdicio = []
    for idx in range(38, 49):
        r = rows[idx]
        placa = clean_cell(r, 7)
        if not placa or placa == "Placa Ofensora":
            continue
        top10_ofensores_desperdicio.append({
            "placa": placa,
            "equipamento": clean_cell(r, 8) or "Veículo da Frota",
            "combustivel": clean_cell(r, 9),
            "litros_consumidos": parse_ptbr_float(clean_cell(r, 10)),
            "litros_consumidos_fmt": clean_cell(r, 10),
            "media_km_l_real": parse_ptbr_float(clean_cell(r, 11)),
            "media_km_l_real_fmt": clean_cell(r, 11),
            "saldo_km_l_acumulado": parse_ptbr_float(clean_cell(r, 12)),
            "saldo_km_l_acumulado_fmt": clean_cell(r, 12),
        })

    # 6 (Right). Top 10 Veículos Ofensores do Portal (Divergências / Alertas) (Rows 38-47, Cols 20-24)
    top10_ofensores_portal = []
    for idx in range(37, 49):
        r = rows[idx]
        placa = clean_cell(r, 20)
        if not placa or placa == "Placa Ofensora":
            continue
        top10_ofensores_portal.append({
            "placa": placa,
            "filial": clean_cell(r, 21),
            "qtd_divergencias": parse_ptbr_int(clean_cell(r, 22)),
            "volume_portal": parse_ptbr_float(clean_cell(r, 23)),
            "volume_portal_fmt": clean_cell(r, 23),
            "principal_ocorrencia": clean_cell(r, 24),
        })

    # 6 (Left). Evolução Diária de Consumo por Combustível (Litros) (Rows 53-87, Cols 0-3)
    evolucao_diaria_combustivel = []
    for idx in range(52, 89):
        r = rows[idx]
        dt = clean_cell(r, 0)
        if not dt or dt == "Data (Dia/Mês)":
            continue
        evolucao_diaria_combustivel.append({
            "data": dt,
            "arla": parse_ptbr_float(clean_cell(r, 1)),
            "diesel": parse_ptbr_float(clean_cell(r, 2)),
            "gasolina": parse_ptbr_float(clean_cell(r, 3)),
        })

    # 7. Consumo por Dia da Semana por Combustível (Rows 53-59, Cols 6-9)
    consumo_dia_semana = []
    for idx in range(52, 60):
        r = rows[idx]
        dia = clean_cell(r, 6)
        if not dia or dia == "Dia da Semana":
            continue
        consumo_dia_semana.append({
            "dia_semana": dia,
            "arla": parse_ptbr_float(clean_cell(r, 7)),
            "arla_fmt": clean_cell(r, 7) or "0,00",
            "diesel": parse_ptbr_float(clean_cell(r, 8)),
            "diesel_fmt": clean_cell(r, 8) or "0,00",
            "gasolina": parse_ptbr_float(clean_cell(r, 9)),
            "gasolina_fmt": clean_cell(r, 9) or "0,00",
        })

    # 8. Evolução Mensal por Combustível (Rows 63-64, Cols 6-9)
    evolucao_mensal_combustivel = []
    for idx in range(62, 66):
        r = rows[idx]
        mes = clean_cell(r, 6)
        if not mes or mes == "Mês/Ano":
            continue
        evolucao_mensal_combustivel.append({
            "mes_ano": mes,
            "arla": parse_ptbr_float(clean_cell(r, 7)),
            "arla_fmt": clean_cell(r, 7),
            "diesel": parse_ptbr_float(clean_cell(r, 8)),
            "diesel_fmt": clean_cell(r, 8),
            "gasolina": parse_ptbr_float(clean_cell(r, 9)),
            "gasolina_fmt": clean_cell(r, 9),
        })

    # 9. Evolução Mensal: Fichas vs. Portal (Rows 63-64, Cols 11-13)
    evolucao_mensal_ficha_portal = []
    for idx in range(62, 66):
        r = rows[idx]
        mes = clean_cell(r, 11)
        if not mes or mes == "Mês/Ano":
            continue
        evolucao_mensal_ficha_portal.append({
            "mes_ano": mes,
            "fichas": parse_ptbr_float(clean_cell(r, 12)),
            "fichas_fmt": clean_cell(r, 12),
            "portal": parse_ptbr_float(clean_cell(r, 13)),
            "portal_fmt": clean_cell(r, 13),
        })

    # 10. Auditoria de Conciliação por Filial (Status no Portal) (Rows 69-75, Cols 6-12)
    auditoria_status_portal_filial = []
    for idx in range(68, 77):
        r = rows[idx]
        cod = clean_cell(r, 6)
        if not cod or cod == "Cód. Filial":
            continue
        auditoria_status_portal_filial.append({
            "cod_filial": cod,
            "qtd_fichas": parse_ptbr_int(clean_cell(r, 7)),
            "qtd_fichas_fmt": clean_cell(r, 7),
            "qtd_portal": parse_ptbr_int(clean_cell(r, 8)),
            "qtd_portal_fmt": clean_cell(r, 8),
            "litros_fichas": parse_ptbr_float(clean_cell(r, 9)),
            "litros_fichas_fmt": clean_cell(r, 9),
            "litros_portal": parse_ptbr_float(clean_cell(r, 10)),
            "litros_portal_fmt": clean_cell(r, 10),
            "diferenca": parse_ptbr_float(clean_cell(r, 11)),
            "diferenca_fmt": clean_cell(r, 11),
            "status": clean_cell(r, 12),
        })

    # 11. Top 10 Placas com Divergência (Fichas vs. Portal) (Rows 81-90, Cols 6-9)
    top10_divergencia_placas = []
    for idx in range(80, 91):
        r = rows[idx]
        placa = clean_cell(r, 6)
        if not placa or placa == "Placa":
            continue
        top10_divergencia_placas.append({
            "placa": placa,
            "litros_fichas": parse_ptbr_float(clean_cell(r, 7)),
            "litros_fichas_fmt": clean_cell(r, 7),
            "litros_portal": parse_ptbr_float(clean_cell(r, 8)),
            "litros_portal_fmt": clean_cell(r, 8),
            "diferenca": parse_ptbr_float(clean_cell(r, 9)),
            "diferenca_fmt": clean_cell(r, 9),
        })

    # 12. Impacto Financeiro de Desperdício por Filial (R$) (Rows 81-86, Cols 11-15)
    impacto_financeiro_filial = []
    for idx in range(80, 88):
        r = rows[idx]
        filial = clean_cell(r, 11)
        if not filial or filial == "Filial":
            continue
        impacto_financeiro_filial.append({
            "filial": filial,
            "total_litros": parse_ptbr_float(clean_cell(r, 12)),
            "total_litros_fmt": clean_cell(r, 12),
            "saldo_km_l_litros": parse_ptbr_float(clean_cell(r, 13)),
            "saldo_km_l_litros_fmt": clean_cell(r, 13) or "0,00",
            "saldo_km_l_reais": parse_ptbr_float(clean_cell(r, 14)),
            "saldo_km_l_reais_fmt": clean_cell(r, 14) or "0,00",
            "saldo_l_h_reais": parse_ptbr_float(clean_cell(r, 15)),
            "saldo_l_h_reais_fmt": clean_cell(r, 15) or "0,00",
        })

    # 13. Desempenho por Modalidade de Abastecimento (Rows 94-96, Cols 6-11)
    desempenho_modalidade = []
    for idx in range(93, 98):
        r = rows[idx]
        mod = clean_cell(r, 6)
        if not mod or mod == "Modalidade":
            continue
        desempenho_modalidade.append({
            "modalidade": mod,
            "qtd_abast": parse_ptbr_int(clean_cell(r, 7)),
            "qtd_abast_fmt": clean_cell(r, 7),
            "total_litros": parse_ptbr_float(clean_cell(r, 8)),
            "total_litros_fmt": clean_cell(r, 8),
            "media_l_abast": parse_ptbr_float(clean_cell(r, 9)),
            "media_l_abast_fmt": clean_cell(r, 9),
            "total_km": parse_ptbr_float(clean_cell(r, 10)),
            "total_km_fmt": clean_cell(r, 10),
            "saldo_km_l": parse_ptbr_float(clean_cell(r, 11)),
            "saldo_km_l_fmt": clean_cell(r, 11),
        })

    # 14. Top 10 Centros de Custo / Operações Consumidoras (Equipamentos) (Rows 94-103, Cols 12-14)
    top10_operacoes_equipamentos = []
    for idx in range(93, 104):
        r = rows[idx]
        eq = clean_cell(r, 12)
        if not eq or eq == "Equipamento / Operação":
            continue
        top10_operacoes_equipamentos.append({
            "equipamento_operacao": eq,
            "qtd_abast": parse_ptbr_int(clean_cell(r, 13)),
            "qtd_abast_fmt": clean_cell(r, 13),
            "total_litros": parse_ptbr_float(clean_cell(r, 14)),
            "total_litros_fmt": clean_cell(r, 14),
        })

    # 15. Comparativo por Dia da Semana: Fichas vs. Portal vs. SCP (Rows 106-113, Cols 0-9)
    comparativo_dia_semana_fontes = []
    for idx in range(106, 114):
        r = rows[idx]
        dia = clean_cell(r, 0)
        if not dia or "TOTAL" in dia.upper():
            continue
        comparativo_dia_semana_fontes.append({
            "dia_semana": dia,
            "ficha_diesel": parse_ptbr_float(clean_cell(r, 1)),
            "portal_diesel": parse_ptbr_float(clean_cell(r, 2)),
            "scp_diesel": parse_ptbr_float(clean_cell(r, 3)),
            "ficha_gasolina": parse_ptbr_float(clean_cell(r, 4)),
            "portal_gasolina": parse_ptbr_float(clean_cell(r, 5)),
            "scp_gasolina": parse_ptbr_float(clean_cell(r, 6)),
            "ficha_arla": parse_ptbr_float(clean_cell(r, 7)),
            "portal_arla": parse_ptbr_float(clean_cell(r, 8)),
            "scp_arla": parse_ptbr_float(clean_cell(r, 9)),
        })

    # 16. Comparativo Evolução Diária: Fichas vs. Portal vs. SCP (Rows 117-147, Cols 0-9)
    comparativo_evolucao_diaria_fontes = []
    for idx in range(117, 149):
        r = rows[idx]
        dt = clean_cell(r, 0)
        if not dt or dt == "Data":
            continue
        comparativo_evolucao_diaria_fontes.append({
            "data": dt,
            "ficha_diesel": parse_ptbr_float(clean_cell(r, 1)),
            "portal_diesel": parse_ptbr_float(clean_cell(r, 2)),
            "scp_diesel": parse_ptbr_float(clean_cell(r, 3)),
            "ficha_gasolina": parse_ptbr_float(clean_cell(r, 4)),
            "portal_gasolina": parse_ptbr_float(clean_cell(r, 5)),
            "scp_gasolina": parse_ptbr_float(clean_cell(r, 6)),
            "ficha_arla": parse_ptbr_float(clean_cell(r, 7)),
            "portal_arla": parse_ptbr_float(clean_cell(r, 8)),
            "scp_arla": parse_ptbr_float(clean_cell(r, 9)),
        })

    # 17, 18, 19. Consumo por Centro de Custo (Rows 168-177, Cols 0-10)
    cc_diesel, cc_gasolina, cc_arla = [], [], []
    for idx in range(168, 179):
        r = rows[idx]
        if clean_cell(r, 0) and clean_cell(r, 0) != "Centro de Custo":
            cc_diesel.append({
                "cc": clean_cell(r, 0),
                "descricao": clean_cell(r, 1),
                "label": f"{clean_cell(r, 0)} - {clean_cell(r, 1)}",
                "litros": parse_ptbr_float(clean_cell(r, 2)),
                "litros_fmt": clean_cell(r, 2),
            })
        if clean_cell(r, 4) and clean_cell(r, 4) != "Centro de Custo":
            cc_gasolina.append({
                "cc": clean_cell(r, 4),
                "descricao": clean_cell(r, 5),
                "label": f"{clean_cell(r, 4)} - {clean_cell(r, 5)}",
                "litros": parse_ptbr_float(clean_cell(r, 6)),
                "litros_fmt": clean_cell(r, 6),
            })
        if clean_cell(r, 8) and clean_cell(r, 8) != "Centro de Custo":
            cc_arla.append({
                "cc": clean_cell(r, 8),
                "descricao": clean_cell(r, 9),
                "label": f"{clean_cell(r, 8)} - {clean_cell(r, 9)}",
                "litros": parse_ptbr_float(clean_cell(r, 10)),
                "litros_fmt": clean_cell(r, 10),
            })

    # 20. Ranking de Produtividade, Eficiência e Auditoria por Frentista (Rows 182-193, Cols 0-17)
    ranking_frentistas = []
    total_rede_frentistas = None
    for idx in range(182, len(rows)):
        r = rows[idx]
        frent = clean_cell(r, 1)
        if not frent or frent == "Frentista":
            continue
        item = {
            "rank": clean_cell(r, 0),
            "frentista": frent,
            "qtd_abast": parse_ptbr_int(clean_cell(r, 2)),
            "qtd_abast_fmt": clean_cell(r, 2),
            "total_litros": parse_ptbr_float(clean_cell(r, 3)),
            "total_litros_fmt": clean_cell(r, 3),
            "media_km_l": parse_ptbr_float(clean_cell(r, 4)),
            "media_km_l_fmt": clean_cell(r, 4),
            "media_l_h": parse_ptbr_float(clean_cell(r, 5)),
            "media_l_h_fmt": clean_cell(r, 5),
            "media_divergencia_pct": parse_ptbr_float(clean_cell(r, 6)),
            "media_divergencia_fmt": clean_cell(r, 6),
            "index_adesao_app_pct": parse_ptbr_float(clean_cell(r, 7)),
            "index_adesao_app_fmt": clean_cell(r, 7),
            "index_adesao_ficha_pct": parse_ptbr_float(clean_cell(r, 8)),
            "index_adesao_ficha_fmt": clean_cell(r, 8),
            "eficiencia_pct": parse_ptbr_float(clean_cell(r, 9)),
            "eficiencia_fmt": clean_cell(r, 9),
            "status": clean_cell(r, 10),
            "filial": clean_cell(r, 12),
            "abast_fichas": parse_ptbr_int(clean_cell(r, 13)),
            "abast_fichas_fmt": clean_cell(r, 13),
            "abast_portal": parse_ptbr_int(clean_cell(r, 14)),
            "abast_portal_fmt": clean_cell(r, 14),
            "litros_fichas": parse_ptbr_float(clean_cell(r, 15)),
            "litros_fichas_fmt": clean_cell(r, 15),
            "litros_portal": parse_ptbr_float(clean_cell(r, 16)),
            "litros_portal_fmt": clean_cell(r, 16),
            "divergencias_portal": parse_ptbr_int(clean_cell(r, 17)),
            "divergencias_portal_fmt": clean_cell(r, 17),
        }
        if "TOTAL" in frent.upper():
            total_rede_frentistas = item
        else:
            ranking_frentistas.append(item)

    indicadores_data = {
        "meta": {
            "titulo": "PAINEL EXECUTIVO DE INDICADORES - GESTÃO DE COMBUSTÍVEIS E FROTA",
            "subtitulo_dashboard": "DASHBOARD EXECUTIVO - AUDITORIA, SAZONALIDADE E EFICIÊNCIA DE FROTA",
            "data_inicial": clean_cell(r_meta, 0) or "01/10/2026",
            "data_final": clean_cell(r_meta, 1) or "04/11/2026",
            "filtro_tipo": clean_cell(r_meta, 2) or "TODOS",
            "filtro_filial": clean_cell(r_meta, 3) or "TODAS",
            "planilha_origem": "MODELO RELATÓRIO ABASTECIMENTO (Google Sheets)",
        },
        "kpis_globais": {
            "total_abastecimentos": parse_ptbr_int(clean_cell(r_kpis, 0)),
            "total_abastecimentos_fmt": clean_cell(r_kpis, 0),
            "frota_ativa_total": parse_ptbr_int(clean_cell(r_kpis, 1)),
            "frota_ativa_total_fmt": clean_cell(r_kpis, 1),
            "volume_total_abastecido": parse_ptbr_float(clean_cell(r_kpis, 2)),
            "volume_total_abastecido_fmt": clean_cell(r_kpis, 2),
            "volume_total_portal": total_rede_desempenho["volume_portal"] if total_rede_desempenho else 221575.69,
            "volume_total_portal_fmt": total_rede_desempenho["volume_portal_fmt"] if total_rede_desempenho else "221.575,69",
            "total_km_percorrido": parse_ptbr_float(clean_cell(r_kpis, 3)),
            "total_km_percorrido_fmt": clean_cell(r_kpis, 3),
            "total_horas_trabalhadas": parse_ptbr_float(clean_cell(r_kpis, 4)),
            "total_horas_trabalhadas_fmt": clean_cell(r_kpis, 4),
            "taxa_media_eficiencia_app": parse_ptbr_float(clean_cell(r_kpis, 5)),
            "taxa_media_eficiencia_app_fmt": clean_cell(r_kpis, 5),
            "taxa_media_consistencia": parse_ptbr_float(clean_cell(r_kpis, 6)),
            "taxa_media_consistencia_fmt": clean_cell(r_kpis, 6),
            "taxa_media_adesao_portal": parse_ptbr_float(clean_cell(r_kpis, 7)),
            "taxa_media_adesao_portal_fmt": clean_cell(r_kpis, 7),
            "saldo_global_km_l": parse_ptbr_float(clean_cell(r_kpis, 8)),
            "saldo_global_km_l_fmt": clean_cell(r_kpis, 8),
            "saldo_global_l_h": parse_ptbr_float(clean_cell(r_kpis, 9)),
            "saldo_global_l_h_fmt": clean_cell(r_kpis, 9),
            "total_frentistas_ativos": parse_ptbr_int(clean_cell(r_kpis, 10)),
            "total_frentistas_ativos_fmt": clean_cell(r_kpis, 10),
        },
        "desempenho_filiais": desempenho_filiais,
        "total_rede_desempenho": total_rede_desempenho,
        "eficiencia_combustivel": eficiencia_combustivel,
        "total_rede_eficiencia": total_rede_eficiencia,
        "auditoria_conciliacao": auditoria_conciliacao,
        "total_rede_auditoria": total_rede_auditoria,
        "auditoria_empilhada": auditoria_empilhada,
        "top10_maiores_consumidores": top10_maiores_consumidores,
        "top10_ofensores_desperdicio": top10_ofensores_desperdicio,
        "top10_ofensores_portal": top10_ofensores_portal,
        "evolucao_diaria_combustivel": evolucao_diaria_combustivel,
        "consumo_dia_semana": consumo_dia_semana,
        "evolucao_mensal_combustivel": evolucao_mensal_combustivel,
        "evolucao_mensal_ficha_portal": evolucao_mensal_ficha_portal,
        "auditoria_status_portal_filial": auditoria_status_portal_filial,
        "top10_divergencia_placas": top10_divergencia_placas,
        "impacto_financeiro_filial": impacto_financeiro_filial,
        "desempenho_modalidade": desempenho_modalidade,
        "top10_operacoes_equipamentos": top10_operacoes_equipamentos,
        "comparativo_dia_semana_fontes": comparativo_dia_semana_fontes,
        "comparativo_evolucao_diaria_fontes": comparativo_evolucao_diaria_fontes,
        "centro_custo_combustivel": {
            "diesel": cc_diesel,
            "gasolina": cc_gasolina,
            "arla": cc_arla,
        },
        "ranking_frentistas": ranking_frentistas,
        "total_rede_frentistas": total_rede_frentistas,
    }

    with open(INDICADORES_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(indicadores_data, f, ensure_ascii=False, indent=2)
    print(f"[OK] data/indicadores.json gerado com sucesso ({os.path.getsize(INDICADORES_JSON_PATH)} bytes)")


def enrich_vehicles():
    with open(VEHICLES_JSON_PATH, "r", encoding="utf-8") as f:
        vehicles_list = json.load(f)

    # Map vehicles by normalized placa and bem
    vehicles_by_key = {}
    for v in vehicles_list:
        # Reset fueling counters to rebuild cleanly across all 5 Fichas + Portal
        v["abastecimentos_count"] = 0
        v["total_litros"] = 0.0
        v["historico"] = []
        v["abastecimentos_app_count"] = 0
        v["total_litros_app"] = 0.0
        v["historico_app"] = []
        v["fichas_consistentes_count"] = 0
        v["fichas_localizadas_portal_count"] = 0
        v["divergencias_app_count"] = 0
        v["aprovados_app_count"] = 0

        p = normalize_plate(v.get("placa"))
        b = normalize_plate(v.get("bem"))
        if p:
            vehicles_by_key[p] = v
        if b:
            vehicles_by_key[b] = v

    ficha_files = [
        ("0501", "/tmp/ficha_0501.csv"),
        ("0201", "/tmp/ficha_0201.csv"),
        ("0104", "/tmp/ficha_0104.csv"),
        ("0103", "/tmp/ficha_0103.csv"),
        ("0107", "/tmp/ficha_0107.csv"),
        ("0105", "/tmp/ficha_0105.csv"),
    ]

    total_ficha_rows = 0
    for filial, path in ficha_files:
        if not os.path.exists(path):
            continue
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            for idx, r in enumerate(reader):
                if idx < 4 or len(r) < 11:
                    continue
                dt = clean_cell(r, 0)
                if not dt or not dt[:2].isdigit():
                    continue
                raw_placa = clean_cell(r, 3) or clean_cell(r, 4)
                placa = normalize_plate(raw_placa)
                if not placa:
                    continue

                litros = parse_ptbr_float(clean_cell(r, 10))
                comb = clean_cell(r, 9)
                motorista = clean_cell(r, 8)
                km_abast = clean_cell(r, 6)
                horimetro = clean_cell(r, 7)
                frentista = clean_cell(r, 13)
                km_l = clean_cell(r, 18)
                l_h = clean_cell(r, 19)
                cc = clean_cell(r, 22)
                desc_cc = clean_cell(r, 23)
                tipo_mod = clean_cell(r, 30) or "INTERNO"
                validacao = clean_cell(r, 32) or "CONSISTENTE"
                status_portal = clean_cell(r, 33) or ""
                lacre_ret = clean_cell(r, 11)
                lacre_col = clean_cell(r, 12)

                if placa not in vehicles_by_key:
                    equip_desc = clean_cell(r, 5) or clean_cell(r, 4) or "Veículo Operacional"
                    new_v = {
                        "filial": filial,
                        "bem": placa,
                        "placa": placa,
                        "chassi": "",
                        "serie": "",
                        "tipo_modelo": clean_cell(r, 4) or equip_desc,
                        "fabricante": "",
                        "familia": "",
                        "nome_bem": equip_desc,
                        "status_bem": "Não listado em ST9",
                        "situacao_bem": "Ativo (Ficha)",
                        "centro_custo": cc,
                        "modelo": equip_desc,
                        "tipo_contador": "HORIMETRO" if horimetro not in ("", "NT", "0") else "ODOMETRO",
                        "pos_contador": horimetro if horimetro not in ("", "NT", "0") else km_abast,
                        "ult_acomp": dt,
                        "categoria": "",
                        "sit_manut": "Operacional",
                        "chapa_imob": "",
                        "cap_tanque": "",
                        "media_consu": clean_cell(r, 26) or "",
                        "ano_modelo": "",
                        "ano_fabric": "",
                        "nro_motor": "",
                        "med_minima": "",
                        "renavam": "",
                        "abastecimentos_count": 0,
                        "total_litros": 0.0,
                        "historico": [],
                        "abastecimentos_app_count": 0,
                        "total_litros_app": 0.0,
                        "historico_app": [],
                        "fichas_consistentes_count": 0,
                        "fichas_localizadas_portal_count": 0,
                        "divergencias_app_count": 0,
                        "aprovados_app_count": 0,
                    }
                    vehicles_list.append(new_v)
                    vehicles_by_key[placa] = new_v

                v = vehicles_by_key[placa]
                if not v.get("centro_custo") and cc:
                    v["centro_custo"] = cc
                v["abastecimentos_count"] += 1
                v["total_litros"] = round(v["total_litros"] + litros, 2)
                if "CONSISTENTE" in validacao.upper() and "INCONSISTENTE" not in validacao.upper():
                    v["fichas_consistentes_count"] += 1
                if "LOCALIZADO" in status_portal.upper() and "NÃO" not in status_portal.upper():
                    v["fichas_localizadas_portal_count"] += 1

                v["historico"].append({
                    "origem": "FICHA",
                    "filial": filial,
                    "data": dt,
                    "combustivel": comb,
                    "litros": litros,
                    "horimetro": horimetro,
                    "km": km_abast,
                    "km_l": km_l,
                    "l_h": l_h,
                    "motorista": motorista,
                    "frentista": frentista,
                    "modalidade": tipo_mod,
                    "validacao": validacao,
                    "status_portal": status_portal,
                    "lacre": f"{lacre_ret} -> {lacre_col}" if (lacre_ret or lacre_col) else "-",
                })
                total_ficha_rows += 1

    # Process Portal Almoxarifado (Aplicativo)
    total_portal_rows = 0
    if os.path.exists("/tmp/portal.csv"):
        with open("/tmp/portal.csv", "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            for idx, r in enumerate(reader):
                if idx < 4 or len(r) < 12:
                    continue
                dt_hora = clean_cell(r, 0)
                dt_pura = clean_cell(r, 21) or (dt_hora.split(" ")[0] if dt_hora else "")
                if not dt_pura or not dt_pura[:2].isdigit():
                    continue
                filial = clean_cell(r, 1)
                raw_placa = clean_cell(r, 3) or clean_cell(r, 4)
                placa = normalize_plate(raw_placa)
                if not placa:
                    continue

                operador = clean_cell(r, 5)
                comb = clean_cell(r, 6)
                tipo_mod = clean_cell(r, 7) or "INTERNO"
                litros = parse_ptbr_float(clean_cell(r, 24) or clean_cell(r, 8))
                km_app = clean_cell(r, 9)
                horim_app = clean_cell(r, 10)
                status_app = clean_cell(r, 11)
                diverg_col = clean_cell(r, 15) or clean_cell(r, 28)
                status_conc_ficha = clean_cell(r, 29)
                duplicado = clean_cell(r, 19)

                if placa not in vehicles_by_key:
                    new_v = {
                        "filial": filial or "0102",
                        "bem": placa,
                        "placa": placa,
                        "chassi": "",
                        "serie": "",
                        "tipo_modelo": "VEÍCULO PORTAL APP",
                        "fabricante": "",
                        "familia": "",
                        "nome_bem": f"VEÍCULO {placa} (PORTAL APP)",
                        "status_bem": "Registrado via App",
                        "situacao_bem": "Ativo (App)",
                        "centro_custo": "",
                        "modelo": "VEÍCULO PORTAL APP",
                        "tipo_contador": "HORIMETRO" if horim_app not in ("", "0", "1", "NT") else "ODOMETRO",
                        "pos_contador": horim_app if horim_app not in ("", "0", "1", "NT") else km_app,
                        "ult_acomp": dt_pura,
                        "categoria": "",
                        "sit_manut": "Operacional",
                        "chapa_imob": "",
                        "cap_tanque": "",
                        "media_consu": "",
                        "ano_modelo": "",
                        "ano_fabric": "",
                        "nro_motor": "",
                        "med_minima": "",
                        "renavam": "",
                        "abastecimentos_count": 0,
                        "total_litros": 0.0,
                        "historico": [],
                        "abastecimentos_app_count": 0,
                        "total_litros_app": 0.0,
                        "historico_app": [],
                        "fichas_consistentes_count": 0,
                        "fichas_localizadas_portal_count": 0,
                        "divergencias_app_count": 0,
                        "aprovados_app_count": 0,
                    }
                    vehicles_list.append(new_v)
                    vehicles_by_key[placa] = new_v

                v = vehicles_by_key[placa]
                v["abastecimentos_app_count"] += 1
                v["total_litros_app"] = round(v["total_litros_app"] + litros, 2)
                if "APROVADO" in status_app.upper() or status_conc_ficha.upper() == "OK":
                    v["aprovados_app_count"] += 1
                if diverg_col and diverg_col.upper() not in ("", "OK", "NENHUMA"):
                    v["divergencias_app_count"] += 1

                v["historico_app"].append({
                    "origem": "APP",
                    "filial": filial,
                    "data": dt_pura,
                    "data_hora": dt_hora,
                    "combustivel": comb,
                    "litros": litros,
                    "horimetro": horim_app,
                    "km": km_app,
                    "operador": operador.split(" (")[0] if operador else "-",
                    "modalidade": tipo_mod,
                    "status": status_app,
                    "divergencia": diverg_col if diverg_col else "OK",
                    "conciliacao_ficha": status_conc_ficha or "-",
                    "duplicado": duplicado or "NÃO",
                })
                total_portal_rows += 1

    # Compute parallel reconciliation metrics per vehicle & cap history lists to 25 most recent
    for v in vehicles_list:
        v["historico"] = v["historico"][-25:]
        v["historico_app"] = v["historico_app"][-25:]

        f_litros = v.get("total_litros", 0.0)
        p_litros = v.get("total_litros_app", 0.0)
        f_cnt = v.get("abastecimentos_count", 0)
        p_cnt = v.get("abastecimentos_app_count", 0)

        v["diferenca_litros"] = round(f_litros - p_litros, 2)
        if f_litros > 0:
            v["taxa_adesao_app"] = round(min(100.0, (p_litros / f_litros) * 100.0), 1)
        elif p_litros > 0:
            v["taxa_adesao_app"] = 100.0
        else:
            v["taxa_adesao_app"] = 0.0

        if f_cnt == 0 and p_cnt == 0:
            v["conciliacao_status"] = "Sem Abastecimento"
        elif f_cnt > 0 and p_cnt > 0:
            if abs(f_litros - p_litros) <= 5.0 and f_cnt == p_cnt:
                v["conciliacao_status"] = "Conciliado (Ficha = App)"
            else:
                v["conciliacao_status"] = "Em Conciliação (Ficha + App)"
        elif f_cnt > 0 and p_cnt == 0:
            v["conciliacao_status"] = "Apenas na Ficha (Falta no App)"
        else:
            v["conciliacao_status"] = "Apenas no App (Sem Ficha)"

    vehicles_list.sort(key=lambda x: (x.get("placa") or x.get("bem") or ""))

    with open(VEHICLES_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(vehicles_list, f, ensure_ascii=False, indent=2)

    with_ficha = sum(1 for x in vehicles_list if x["abastecimentos_count"] > 0)
    with_app = sum(1 for x in vehicles_list if x["abastecimentos_app_count"] > 0)
    with_both = sum(1 for x in vehicles_list if x["abastecimentos_count"] > 0 and x["abastecimentos_app_count"] > 0)
    print(f"[OK] data/vehicles.json atualizado: {len(vehicles_list)} veículos | Ficha: {with_ficha} ({total_ficha_rows} reg) | App: {with_app} ({total_portal_rows} reg) | Ambos em paralelo: {with_both}")


if __name__ == "__main__":
    build_indicadores()
    enrich_vehicles()
