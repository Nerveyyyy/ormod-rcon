# ORMOD: Directive Game Server Commands

This is the authoritative reference for all ORMOD: Directive game server console commands. Use this document for dashboard quick-commands panel validation, backend command dispatch, and permission level enforcement.

## Permission Hierarchy

Commands are restricted by user permission level on the server. The hierarchy from lowest to highest privilege is:

```
[client] → [operator] → [admin] → [server]
```

Each level inherits all commands from lower levels and adds its own.

## Main Commands by Permission Level

### [server] Permissions

| Command | Syntax | Description |
|---------|--------|-------------|
| setserversetting | `setserversetting [setting] [value]` | Set a server setting value |
| setpermissions | `setpermissions [steamId] [level]` | Assign permission level to a player |
| removepermissions | `removepermissions [steamId]` | Remove all permissions from a player |
| authenabled | `authenabled [true/false]` | Enable or disable serverside authentication |
| anticheatenabled | `anticheatenabled [true/false]` | Enable or disable anticheat system |
| forcesave | `forcesave` | Force an immediate server save |

### [admin] Permissions

| Command | Syntax | Description |
|---------|--------|-------------|
| spawn | `spawn [entity name]` | Spawn entity at own location |
| spawn | `spawn [entity name] [steamId]` | Spawn entity at specified player's location |
| spawn | `spawn [entity name] [X] [Y] [Z]` | Spawn entity at specific coordinates |
| setdata | `setdata [entity id] [key] [value]` | Set a data tag on an entity |
| noclip | `noclip` | Toggle noclip mode for self |
| noclip | `noclip [steamId] [true/false]` | Enable or disable noclip for a player |
| godmode | `godmode` | Toggle godmode for self |
| godmode | `godmode [steamId] [true/false]` | Enable or disable godmode for a player |
| spectator | `spectator` | Toggle spectator mode for self |
| spectator | `spectator [steamId] [true/false]` | Enable or disable spectator mode for a player |
| enabletracers | `enabletracers [true/false]` | Enable or disable bullet tracers |
| forcerespawnloot | `forcerespawnloot` | Force immediate respawn of all loot pools |
| getserversettings | `getserversettings` | Retrieve all current server settings |
| settime | `settime [0000-2400]` | Set in-game time (24-hour format) |
| setweather | `setweather [cloudy/stormy/overcast/sparse/clear/lightningstorm/lightrain]` | Change weather condition |
| setfog | `setfog [true/false]` | Enable or disable fog |
| setammo | `setammo [true/false]` | Toggle ammo requirement for weapons and turrets |
| teleport | `teleport [steamId]` | Teleport self to a player |
| teleport | `teleport [from steamId] [to steamId]` | Teleport one player to another |
| teleport | `teleport [x] [y] [z]` | Teleport self to coordinates |
| teleport | `teleport [steamId] [x] [y] [z]` | Teleport player to coordinates |
| ban | `ban [steamId]` | Ban a player from the server |
| unban | `unban [steamId]` | Remove a ban from a player |
| whitelist | `whitelist [steamId]` | Add a player to the whitelist |
| removewhitelist | `removewhitelist [steamId]` | Remove a player from the whitelist |
| kill | `kill [steamId]` | Kill a specified player |
| killall | `killall` | Kill all players on the server |

### [operator] Permissions

| Command | Syntax | Description |
|---------|--------|-------------|
| getentity | `getentity` | Get the ID of entity you are looking at |
| getbiome | `getbiome` | Get the current biome name |
| addxp | `addxp [amount]` | Add experience points to self |
| addxp | `addxp [steamId] [amount]` | Add experience points to a player |
| addeffect | `addeffect [stat name] [duration] [amount]` | Add a status effect to self |
| addeffect | `addeffect [steamId] [stat name] [duration] [amount]` | Add a status effect to a player |
| removeeffect | `removeeffect [stat name]` | Remove a status effect from self |
| removeeffect | `removeeffect [steamId] [stat name]` | Remove a status effect from a player |
| cleareffects | `cleareffects` | Clear all status effects from self |
| cleareffects | `cleareffects [steamId]` | Clear all status effects from a player |
| unlockallskills | `unlockallskills` | Unlock all skills for self |
| unlockallskills | `unlockallskills [steamId]` | Unlock all skills for a player |
| unlockallblueprints | `unlockallblueprints` | Unlock all blueprints for self |
| unlockallblueprints | `unlockallblueprints [steamId]` | Unlock all blueprints for a player |
| heal | `heal` | Reset all stats (health, hunger, thirst, etc.) for self |
| heal | `heal [steamId]` | Reset all stats for a player |
| getlocation | `getlocation` | Get your current location coordinates |
| seed | `seed` | Get current location and world seed |
| getplayers | `getplayers` | List all players currently on the server |
| announcement | `announcement [message]` | Broadcast a chat announcement to all players |
| kick | `kick [steamId]` | Kick a player from the server |

### [client] Permissions

| Command | Syntax | Description |
|---------|--------|-------------|
| clear | `clear` | Clear the console window |
| gettime | `gettime` | Get the current in-game time |
| getentities | `getentities` | List all spawnable items |
| getworkbenches | `getworkbenches` | List all spawnable workbenches |
| getvehicles | `getvehicles` | List all spawnable vehicles |
| getenemies | `getenemies` | List all spawnable enemies |
| getstatuseffects | `getstatuseffects` | List all available status effects |
| getsteamid | `getsteamid` | Get your Steam ID |
| combatlog | `combatlog` | View bullet and damage debug information |
| kill | `kill` | Kill yourself |
| disconnect | `disconnect` | Disconnect from the server |
| connect | `connect [server IP]` | Connect to a server by IP address |
| connect | `connect [steamId]` | Connect to a player's hosted server |

## Arena Commands

### [admin] Arena

| Command | Syntax | Description |
|---------|--------|-------------|
| setkit | `setkit [steamId] [kitname]` | Assign a kit to a specific player |
| setkitall | `setkitall [kitname]` | Assign a kit to all players in arena |
| setkitquality | `setkitquality [poor/low/medium/full]` | Set minimum kit quality level allowed |

### [operator] Arena

| Command | Syntax | Description |
|---------|--------|-------------|
| setteamspawn | `setteamspawn [teamnumber]` | Set the spawn point for an arena team at your location |
| setteam | `setteam [steamId] [teamnumber]` | Assign a player to an arena team |
| startmatch | `startmatch` | Start a new arena match |
| getallkits | `getallkits` | List all available kits on the server |

### [client] Arena

| Command | Syntax | Description |
|---------|--------|-------------|
| getkits | `getkits` | List all kits you are allowed to use |
| setkit | `setkit [kitname]` | Set your kit in arena mode (arena only) |

---

**Last Updated:** 2026-03-17
**Format Version:** 1.0
