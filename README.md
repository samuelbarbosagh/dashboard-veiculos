# 🚛 Dashboard de Consulta de Veículos & Frotas

Dashboard web interativo e responsivo para consulta detalhada de veículos, frotas e equipamentos, integrado aos dados da planilha de abastecimento (**ST9** e **Fichas de Filiais**).

## 🌟 Funcionalidades
- **Busca Rápida**: Pesquise por Placa, Prefixo (ex: `GRZ`, `TRP`, `PM`), Modelo ou Número de Série.
- **Filtros Inteligentes**: Filtre por Filial (ex: `0501 - Aparecida`, `0201 - Uberaba`, etc.) e Família/Categoria.
- **Alertas Operacionais**: Identificação visual de contadores parados/estagnados (ex: horímetro em posição 1).
- **Ficha Técnica do Bem**: Código Protheus, Chassi, Série, Fabricante e Centro de Custo.
- **Histórico de Abastecimentos**: Visualização de litragens, combustível (Diesel/Gasolina/Arla), frentista e motorista.
- **Atualização Automática**: Sincronização agendada via GitHub Actions.

## 🚀 Como Executar Localmente
Para rodar localmente, basta servir a pasta com qualquer servidor HTTP:
```bash
python3 -m http.server 8000
```
Em seguida, acesse no navegador: `http://localhost:8000`.

## ⚙️ Automação (GitHub Actions)
O workflow `.github/workflows/update-data.yml` roda a cada 6 horas para manter o arquivo `data/vehicles.json` sempre atualizado a partir do Google Sheets.
