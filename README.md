# Logística Freedom (TV)

Painel de logística para a TV: vendas faturadas do dia, demais operações, total faturado e, em quadradinhos, os pedidos em aberto por dia (só os sem motivo). Clicando no dia, aparece a lista dos pedidos.

- `index.html`: a tela. Abra com `?exemplo` no final do endereço para ver com dados de mentira.
- `login.js`: igual ao do tv-freedom (login guardado só no navegador). `config.js`: aponta para a função de logística no Supabase (`tvlogistica`).
- `supabase/paineis-logistica/index.ts`: código da função (não vai para o GitHub Pages; é colado no Supabase).
- `logo.png`: logo oficial.

## A função do Supabase (nova, separada da paineis-tv)

O código está em `supabase/paineis-logistica/index.ts`. Ela entra no site de relatórios com o login da TV e devolve:

- **Faturado de hoje** (`/logistics/billing/daily`): Venda em destaque, demais tipos de pedido (bonificação etc.) e o total.
- **Pedidos em aberto por dia** (`/logistics/pending/orders`): pedidos ainda sem nota fiscal, **sem motivo**, de 31/10 em diante, com a situação da conferência (sem registro, em conferência, conferido não faturado).

Como criar no Supabase (projeto suporte-freedom):

1. Edge Functions → **Deploy a new function** → **Via Editor**.
2. Nome: `paineis-logistica` (se o Supabase criar com outro nome, como `tvlogistica`, o endereço usa esse nome; ajuste o `config.js`). Apague o código de exemplo e cole o conteúdo de `supabase/paineis-logistica/index.ts`. Clique em **Deploy**.
3. Abra a função criada, vá em **Settings** e **desligue "Verify JWT"** (a TV não manda token do Supabase; sem isso dá erro 401).
4. O login usado na TV precisa ter acesso à **Logística** no site de relatórios.

Formato que a função devolve (a tela lê exatamente isto):

```json
{
  "atualizado_em": "2026-11-13T14:20:00-03:00",
  "periodo": { "hoje": "2026-11-13" },
  "faturado": { "vendas": 15146.28, "outros": [ { "nome": "Bonificação", "valor": 400, "notas": 1 } ], "total": 15546.28 },
  "abertos": [ { "dia": "2026-10-31", "pedidos": [ { "pedido": "121625", "cliente": "NOME", "valor": 1234.56, "situacao": "sem_registro" } ] } ]
}
```

## Como publicar

1. No GitHub, crie um repositório novo (ex.: `logistica-freedom`) e envie estes arquivos.
2. Em Settings → Pages, publique a branch `main`.
3. Não suba planilhas, XMLs nem arquivos com dados da empresa neste repositório.
