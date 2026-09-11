-- Invitations can now be addressed to an email address instead of an
-- account ID, so a membership row has to exist before the invited person
-- has an account: user_id stays NULL until they accept, and invite_token
-- is the unguessable secret carried by the emailed link.
ALTER TABLE team_members ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS invited_email TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS invite_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_invite_token
  ON team_members(invite_token) WHERE invite_token IS NOT NULL;

-- One live invitation per address per team. Declining, revoking or removing
-- deletes the row, which frees the address to be invited again.
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_invited_email
  ON team_members(team_id, invited_email) WHERE invited_email IS NOT NULL;

-- Every row still has to identify who it is for, one way or the other.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_members_identity_check') THEN
    ALTER TABLE team_members
      ADD CONSTRAINT team_members_identity_check
      CHECK (user_id IS NOT NULL OR invited_email IS NOT NULL);
  END IF;
END $$;
