# Publier TokGuess sur VS Marketplace

Compte Microsoft : `zahra.maaziz03@gmail.com`  
Publisher ID : `maazizit` (doit matcher `package.json`)

## 1. Créer le publisher (une seule fois)

1. Ouvre https://marketplace.visualstudio.com/manage/createpublisher
2. Connecte-toi avec `zahra.maaziz03@gmail.com`
3. Remplis :
   - **Name** : `maazizit`
   - **ID** : `maazizit`
   - **Publisher** : ton nom ou `maazizit`

## 2. Créer un Personal Access Token (PAT)

1. Ouvre https://dev.azure.com
2. Connecte-toi (même compte Microsoft)
3. Crée une organisation si demandé (nom libre, ex. `maazizit`)
4. En haut à droite → **User settings** → **Personal access tokens**
5. **+ New Token** :
   - Name : `vsce-tokguess`
   - Organization : **All accessible organizations**
   - Expiration : 90 jours (ou custom)
   - Scopes : **Custom defined** → **Marketplace** → cocher **Manage**
6. **Create** → copie le token (visible une seule fois)

## 3. Publier

Dans le terminal, depuis ce dossier :

```bash
cd ~/Desktop/tokguess
npx @vscode/vsce login maazizit
# Colle le PAT quand demandé

npx @vscode/vsce publish
```

Ou en une ligne (ne partage le token dans le chat) :

```bash
npx @vscode/vsce publish -p "TON_PAT_ICI"
```

## 4. Vérifier

https://marketplace.visualstudio.com/items?itemName=maazizit.tokguess-copilot
