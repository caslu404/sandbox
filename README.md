# Sandbox de Ideias

Board Kanban minimalista para capturar e organizar ideias de apps e ferramentas internas.

---

## Abrir localmente

### Opção mais simples — arquivo direto
Abra o `index.html` no seu browser. Funciona assim, sem servidor.

### Com servidor local (recomendado para GitHub Pages parity)
```bash
# Python (já vem no Mac)
python3 -m http.server 3000

# Node.js
npx serve .
```
Acesse `http://localhost:3000`

---

## GitHub Pages

1. Crie um repositório no GitHub e faça push dessa pasta
2. Vá em **Settings → Pages → Source**: branch `main`, pasta `/`
3. Seu sandbox vai estar em `https://seu-usuario.github.io/nome-do-repo`

---

## Stream Deck

Configure um botão **"Website"** ou **"Open"** apontando para uma das opções:

| Modo | URL |
|------|-----|
| Arquivo local | `file:///caminho/completo/para/sandbox-ideias/index.html` |
| Servidor local | `http://localhost:3000` |
| GitHub Pages | `https://seu-usuario.github.io/nome-do-repo` |

---

## Como usar

### Captura rápida
Digite na barra no topo e pressione **↵ Enter** — a ideia vai direto para o Sandbox.

Você pode usar **#hashtags** diretamente no título:
```
Resumo semanal de lojistas #automação #sales
```
As tags são extraídas automaticamente.

### Cards
- **Clique** para abrir e editar os detalhes
- **Arraste** horizontalmente para mover entre colunas
- **Arraste** verticalmente para reordenar dentro da coluna
- **⋯** para mover rapidamente ou excluir

### Atalhos de teclado
| Tecla | Ação |
|-------|------|
| `n` | Nova ideia (abre modal) |
| `/` | Foca a barra de captura rápida |
| `Esc` | Fecha modal / menu |

---

## Dados

Tudo fica no `localStorage` do seu browser — não precisa de servidor ou banco de dados.

**Backup**: clique em **↓** no canto superior direito para exportar um JSON.  
**Restaurar**: clique em **↑** para importar um JSON exportado anteriormente.
