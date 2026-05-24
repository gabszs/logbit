# Organization & Access Context

Manages user identity, organizational membership, and user experience preferences. Responsible for authentication, access control setup (future RBAC), and personalization.

## Language

**User**: A person who can authenticate to LogLog. Has a name, email, and image. Can belong to multiple organizations.
_Avoid_: Account, profile (profile is a feature, not a domain concept)

**Organization**: A container for data segregation and collaboration. Represents a team, company, or workspace. Segregates all metadata (connections, sources, members) but NOT telemetry data in ClickHouse (each org can connect to its own ClickHouse instances). Every user has at least one default organization created on first login.
_Avoid_: Workspace (too generic), Team (could mean members), Account (refers to user, not org)

**Member**: A user who belongs to an organization with an assigned role. The relationship between a User and an Organization.
_Avoid_: User (User is a global concept, Member is org-specific), Participant

**Role**: A designation within an organization that determines scope (current roles: owner, admin, member). RBAC is not yet enforced at feature level, but structure is in place for future implementation.
_Avoid_: Permission (permissions are derived from roles, not independent), Level

**Owner**: The role of the user who created an organization. Has implicit full access (RBAC will formalize this).
_Avoid_: Admin (different roles)

**Admin**: An organizational role with elevated privileges. Can manage members and resources within the organization. Exact permissions to be defined with RBAC implementation.
_Avoid_: Owner (different scope), Moderator

**Member Role**: The basic role within an organization. Default role assigned to newly invited users. Exact permissions TBD with RBAC.
_Avoid_: Participant (too generic), User (refers to person, not role)

**Session**: An authenticated connection to LogLog for a User. Contains device info (browser, OS), token, expiration. User can revoke sessions individually.
_Avoid_: Login (action, not entity), Token (token is implementation detail)

**Profile**: The personal identity information of a User (name, email, image, device history). User can view and edit their own profile.
_Avoid_: Account (refers to global user, not personal info)

**Settings**: User preferences that persist across sessions and devices. Includes:
- `theme`: visual preference (light/dark)
- `activeOrganization`: which organization the user is currently viewing
- `defaultSource`: which source the user last viewed (UX convenience)
- `defaultConnection`: which connection the user last viewed (UX convenience)

_Avoid_: Preferences (same thing, just different word), Config (implies system-level)

**Active Organization**: The organization a user has selected to view. Determines which connections and sources they see. Persisted in user settings.
_Avoid_: Current organization (ambiguous with session context)

## Example Dialogue

**Scenario**: A new user joins LogLog

> **Dev**: "We need to onboard alice@acme.com"
> 
> **Domain Expert**: "When alice signs up, the system creates a default organization for her—let's call it 'alice's organization'. She's the owner of that organization."
> 
> **Dev**: "So when she logs in, she can immediately see her own organization?"
> 
> **DE**: "Yes, it's automatically her active organization. Later, an admin from 'Acme Corp' can invite alice to their organization with the member role."
> 
> **Dev**: "If alice is a member in Acme Corp, can she still use her personal organization?"
> 
> **DE**: "Yes—she can be a member of both. She just switches between them by changing her active organization in settings."
> 
> **Dev**: "What if she's the owner of her personal org and a member in Acme Corp—can she manage Acme?"
> 
> **DE**: "No. Her role is 'member' in Acme, so once RBAC is enforced, she'll only have member permissions there. Her ownership in her personal org doesn't carry over."

## Flagged Ambiguities

**"Member" as role vs. "member" as relationship**:
- Use **Member** (capitalized) when referring to the entity/person in the org (e.g., "invite a new member")
- Use **"member role"** when referring to the specific role designation (e.g., "alice has the member role, not admin")
- In conversation, prefer clarity: "alice is a member of Acme with the member role" (though awkward, it's clear)

**Settings vs. Preferences**:
- **Settings** in LogLog specifically means persistent UX defaults (theme, active org, default source/connection)
- These are **not** permissions or restrictions—a user might set a default source for convenience, but they can view other sources
- Compare to [[Data Integration Context]] where **Source** is about what data exists, not user access

