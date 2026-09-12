# Caddy — declarer le sous-domaine

Le serveur de `gestiondojo.ca` a **un seul** Caddy en frontal
(`/etc/caddy/Caddyfile`). Il ne faut donc **rien y ajouter d'autre** que
l'hote : le routage, lui, se fait dans nginx.

## 1. DNS (NameSilo)

```
auto.gestiondojo.ca.   A   103.98.215.181
```

⚠️ Le certificat ne s'emet qu'apres que le DNS pointe : Caddy valide par
HTTP-01, donc un DNS pas encore propage donne un echec TLS, pas un bug.

## 2. Caddyfile

Ajouter `auto.gestiondojo.ca` a la liste des **hotes connus** du bloc
principal (celui qui fait `reverse_proxy 127.0.0.1:8080`) :

```caddyfile
gestiondojo.ca, www.gestiondojo.ca, dev.gestiondojo.ca,
jeux.gestiondojo.ca, loren.gestiondojo.ca,
auto.gestiondojo.ca,
103-98-215-181.ca-tr-cloud-xip.com, ... {
	reverse_proxy 127.0.0.1:8080
}
```

⚠️ **Ne pas** compter sur le bloc `https://` « on-demand » des domaines
personnalises des dojos : son `ask` interroge la base de gestion-dojo, qui ne
connait pas ce sous-domaine et repondrait non.

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## 3. nginx

Voir `deploy/nginx/auto-gestiondojo.conf.example` : c'est lui qui envoie
l'hote `auto.gestiondojo.ca` vers le gunicorn du jeu (port 8005).
