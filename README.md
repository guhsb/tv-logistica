# Logística Freedom (TV)

Painel de logística para a TV: vendas faturadas do dia, demais operações, total faturado e, em quadradinhos, os pedidos em aberto por dia (só os sem motivo). Clicando no dia, aparece a lista dos pedidos.

- `index.html`: a tela. Abra com `?exemplo` no final do endereço para ver com dados de mentira.
- `login.js` e `config.js`: iguais aos do tv-freedom (login guardado só no navegador e endereço da função do Supabase).
- `logo.png`: logo oficial.

## O que a função `paineis-tv` precisa devolver em `?tipo=logistica`

```json
{
  "atualizado_em": "2026-11-13T14:20:00-03:00",
  "periodo": { "hoje": "2026-11-13" },
  "faturado": {
    "vendas": 187430.50,
    "outros": [ { "nome": "Comodato", "valor": 12800.00, "notas": 4 } ],
    "total": 205601.40
  },
  "abertos": [
    { "dia": "2026-10-31",
      "pedidos": [ { "pedido": 121625, "cliente": "NOME", "valor": 1234.56,
                     "situacao": "sem_registro" } ] }
  ]
}
```

- `situacao`: `sem_registro`, `em_conferencia` ou `conferido_nao_faturado`.
- `abertos` já vem filtrado pela função: pedidos desde 31/10, ainda sem nota fiscal e **sem motivo** (cruzando os painéis Pedidos e Conferência). Dias sem pedidos não precisam vir.

## Como publicar

1. No GitHub, crie um repositório novo (ex.: `logistica-freedom`) e envie estes arquivos.
2. Em Settings → Pages, publique a branch `main`.
3. Não suba planilhas, XMLs nem arquivos com dados da empresa neste repositório.
