import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import type { JobMetadata } from '../contracts.js';

const PARTICIPANT_KIND_AGENT = 4; // ParticipantInfo_Kind.AGENT (not re-exported by the SDK)

/** Everything telephony needs from LiveKit. Tests swap in a fake. */
export interface LiveKitOps {
  createRoom(name: string): Promise<void>;
  dispatchAgent(room: string, agentName: string, metadata: JobMetadata): Promise<void>;
  /** Identity of an agent that has joined `room` and published a track (its guide card), or null. */
  readyAgent(room: string): Promise<string | null>;
  deleteRoom(room: string): Promise<void>;
}

export function liveKit(url: string, key: string, secret: string): LiveKitOps {
  const http = url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  const rooms = new RoomServiceClient(http, key, secret);
  const dispatch = new AgentDispatchClient(http, key, secret);
  return {
    async createRoom(name) {
      await rooms.createRoom({ name, emptyTimeout: 600, departureTimeout: 20 });
    },
    async dispatchAgent(room, agentName, metadata) {
      await dispatch.createDispatch(room, agentName, { metadata: JSON.stringify(metadata) });
    },
    async readyAgent(room) {
      const ps = await rooms.listParticipants(room);
      return ps.find((p) => p.kind === PARTICIPANT_KIND_AGENT && p.tracks.length > 0)?.identity ?? null;
    },
    async deleteRoom(room) {
      await rooms.deleteRoom(room);
    },
  };
}

/** Room-scoped token: join + publish + subscribe, nothing else. */
export function mintToken(key: string, secret: string, room: string, identity: string, ttlSeconds: number) {
  const at = new AccessToken(key, secret, { identity, ttl: ttlSeconds });
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });
  return at.toJwt();
}
