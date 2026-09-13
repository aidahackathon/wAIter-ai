"use server";
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || '');

export async function getIncidents() {
  try {
    const data = await redis.get('incidents');
    if (data) {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    }
    return [];
  } catch (error) {
    console.error("Redis get error:", error);
    return [];
  }
}

export async function saveIncident(incident: any) {
  const incidents = await getIncidents();
  incidents.unshift(incident);
  await redis.set('incidents', JSON.stringify(incidents));
  return { success: true };
}

export async function updateIncidentStatus(id: string, status: string) {
  const incidents = await getIncidents();
  const updated = incidents.map((inc: any) => 
    inc.id === id ? { ...inc, status } : inc
  );
  await redis.set('incidents', JSON.stringify(updated));
  return { success: true };
}

export async function clearIncidents() {
  await redis.set('incidents', JSON.stringify([]));
  return { success: true };
}
