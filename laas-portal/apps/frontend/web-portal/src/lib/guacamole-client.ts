// Service to interact with Guacamole API
async function createGuacamoleConnection(params: {
  connectionName: string;
  host: string;
  port: number;
  vmUsername: string;
  vmPassword: string;
}): Promise<{ connectionId: number; guacamoleUrl: string }> {
  const response = await fetch('/api/v1/openstack/guacamole/connections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Failed to create Guacamole connection: ${response.statusText}`);
  }

  return response.json();
}

// Delete connection when session ends (optional cleanup)
async function deleteGuacamoleConnection(connectionId: number): Promise<void> {
  const response = await fetch(`/api/v1/openstack/guacamole/connections/${connectionId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    console.warn(`Failed to delete Guacamole connection: ${response.statusText}`);
  }
}

export { createGuacamoleConnection, deleteGuacamoleConnection };
