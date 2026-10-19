import {
  AccessToken,
  RoomAgentDispatch,
  RoomConfiguration,
  RoomServiceClient,
} from 'livekit-server-sdk';
import type { DispatchMetadata } from '@tutor/core';

export interface LiveKitGateway {
  readonly serverUrl: string;
  /** Short-lived token for one room that also dispatches the tutor agent into it. */
  issueToken(input: {
    identity: string;
    roomName: string;
    metadata: DispatchMetadata;
  }): Promise<string>;
  deleteRoom(roomName: string): Promise<void>;
}

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
  agentName: string;
}

export class LiveKitCloudGateway implements LiveKitGateway {
  readonly serverUrl: string;
  private readonly rooms: RoomServiceClient;

  constructor(private readonly config: LiveKitConfig) {
    this.serverUrl = config.url;
    this.rooms = new RoomServiceClient(
      config.url.replace(/^ws/, 'http'),
      config.apiKey,
      config.apiSecret,
    );
  }

  async issueToken({ identity, roomName, metadata }: Parameters<LiveKitGateway['issueToken']>[0]) {
    const token = new AccessToken(this.config.apiKey, this.config.apiSecret, {
      identity,
      ttl: '10m',
    });
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    token.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: this.config.agentName,
          metadata: JSON.stringify(metadata),
        }),
      ],
    });
    return token.toJwt();
  }

  async deleteRoom(roomName: string) {
    await this.rooms.deleteRoom(roomName);
  }
}
