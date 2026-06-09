# TokGuess — Mode Plus de précision (Copilot)

## En bref

- **Par défaut** : estimation depuis `Chat.log` (~75–85 %)
- **Plus de précision** : tokens **réels** Copilot via OTel local
- **Scope** : Copilot uniquement — Claude/Antigravity inchangés

## Activer

1. Ouvre le dashboard TokGuess
2. Clique **🎯 Plus de précision**
3. Suis l’assistant 3 étapes
4. **Reload Window** quand demandé
5. Utilise Copilot normalement

## Mini serveur local

Un petit service sur `127.0.0.1` reçoit les traces VS Code. Rien ne part sur internet.

## Revenir en arrière

Dashboard → **↩ Mode standard**

## FAQ

**C’est la facture Microsoft ?** Non — coût = tarifs API publics × tokens réels.

**Mes prompts sont stockés ?** Non — attributs sensibles filtrés.

**OTel ne répond plus ?** TokGuess repasse en estimation automatiquement.
