/**
 * Parser para mensagens do protocolo @Track da Queclink GL33CG
 * Versão limpa e funcional
 */

import {
  BaseMessage,
  FrameType,
  CommandType,
  ParseResult,
  PROTOCOL_CONSTANTS,
} from "../types/protocol";

export class ProtocolParser {
  /**
   * Parse de uma mensagem completa do protocolo @Track
   */
  public static parseMessage(rawMessage: string): ParseResult {
    try {
      const cleanMessage = rawMessage.trim();

      if (!cleanMessage.endsWith(PROTOCOL_CONSTANTS.TAIL_CHAR)) {
        return {
          success: false,
          error: "Mensagem não termina com $",
        };
      }

      const frameType = this.identifyFrameType(cleanMessage);
      if (!frameType) {
        return {
          success: false,
          error: "Tipo de frame não reconhecido",
        };
      }

      switch (frameType) {
        case FrameType.ACK:
          return this.parseAckMessage(cleanMessage);
        case FrameType.RESP:
          return this.parseRespMessage(cleanMessage);
        case FrameType.BUFF:
          return this.parseBuffMessage(cleanMessage);
        default:
          return {
            success: false,
            error: `Tipo de frame não suportado: ${frameType}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: `Erro no parsing: ${
          error instanceof Error ? error.message : "Erro desconhecido"
        }`,
      };
    }
  }

  /**
   * Identifica o tipo de frame
   */
  private static identifyFrameType(message: string): FrameType | null {
    if (message.startsWith("+ACK:")) return FrameType.ACK;
    if (message.startsWith("+RESP:")) return FrameType.RESP;
    if (message.startsWith("+BUFF:")) return FrameType.BUFF;
    if (message.startsWith("+SACK:")) return FrameType.SACK;
    return null;
  }

  /**
   * Parse de mensagem ACK (heartbeat)
   */
  private static parseAckMessage(message: string): ParseResult {
    const parts = message.substring(5).replace("$", "").split(",");

    if (parts.length < 6) {
      return {
        success: false,
        error: "Mensagem ACK inválida",
      };
    }

    const parsedMessage: BaseMessage = {
      frameType: FrameType.ACK,
      commandWord: parts[0] || "",
      fullProtocolVersion: parts[1] || "",
      uniqueId: parts[2] || "",
      deviceName: parts[3] || "",
      sendTime: parts[4] || "",
      countNumber: parts[5] || "",
      rawMessage: message,
    };

    let needsAck = false;
    let ackMessage = "";

    if (parsedMessage.commandWord === CommandType.GTHBD) {
      needsAck = true;
      ackMessage = this.generateSackMessage(
        parsedMessage.commandWord,
        parsedMessage.fullProtocolVersion,
        parsedMessage.countNumber
      );
    }

    return {
      success: true,
      message: parsedMessage,
      needsAck,
      ackMessage,
    };
  }

  /**
   * Parse de mensagem RESP
   */
  private static parseRespMessage(message: string): ParseResult {
    const parts = message.substring(6).replace("$", "").split(",");

    if (parts.length < 6) {
      return {
        success: false,
        error: "Mensagem RESP inválida",
      };
    }

    const parsedMessage: BaseMessage = {
      frameType: FrameType.RESP,
      commandWord: parts[0] || "",
      fullProtocolVersion: parts[1] || "",
      uniqueId: parts[2] || "",
      deviceName: parts[3] || "",
      sendTime: parts[parts.length - 2] || "",
      countNumber: parts[parts.length - 1] || "",
      rawMessage: message,
    };

    const ackMessage = this.generateSackMessage(
      undefined,
      undefined,
      parsedMessage.countNumber
    );

    return {
      success: true,
      message: parsedMessage,
      needsAck: true,
      ackMessage,
    };
  }

  /**
   * Parse de mensagem BUFF
   */
  private static parseBuffMessage(message: string): ParseResult {
    const respMessage = message.replace("+BUFF:", "+RESP:");
    const result = this.parseRespMessage(respMessage);

    if (result.success && result.message) {
      result.message.frameType = FrameType.BUFF;
      result.message.rawMessage = message;
    }

    return result;
  }

  /**
   * Gera mensagem SACK
   */
  public static generateSackMessage(
    commandWord?: string,
    protocolVersion?: string,
    countNumber?: string
  ): string {
    if (commandWord && protocolVersion) {
      const version = protocolVersion.substring(0, 6);
      return `+SACK:${commandWord},${version},${countNumber || "0000"}$`;
    } else {
      return `+SACK:${countNumber || "0000"}$`;
    }
  }

  /**
   * Verifica se mensagem está completa
   */
  public static isMessageComplete(data: string): boolean {
    return data.includes(PROTOCOL_CONSTANTS.TAIL_CHAR);
  }

  /**
   * Extrai múltiplas mensagens
   */
  public static extractMessages(buffer: string): string[] {
    const messages: string[] = [];
    const parts = buffer.split(PROTOCOL_CONSTANTS.TAIL_CHAR);

    if (parts[parts.length - 1] === "") {
      parts.pop();
    }

    for (const part of parts) {
      if (part.trim()) {
        messages.push(part.trim() + PROTOCOL_CONSTANTS.TAIL_CHAR);
      }
    }

    return messages;
  }

  /**
   * Valida formato da mensagem
   */
  public static validateMessageFormat(message: string): boolean {
    const validStarts = ["+ACK:", "+RESP:", "+BUFF:", "+SACK:"];
    const hasValidStart = validStarts.some((start) =>
      message.startsWith(start)
    );
    const hasValidEnd = message.endsWith(PROTOCOL_CONSTANTS.TAIL_CHAR);
    const hasContent = message.length > 6;

    return hasValidStart && hasValidEnd && hasContent;
  }

  /**
   * Extrai IMEI da mensagem
   */
  public static extractImei(message: string): string | null {
    try {
      if (!this.validateMessageFormat(message)) {
        return null;
      }

      let parts: string[];
      if (message.startsWith("+ACK:")) {
        parts = message.substring(5).replace("$", "").split(",");
      } else if (message.startsWith("+RESP:") || message.startsWith("+BUFF:")) {
        parts = message.substring(6).replace("$", "").split(",");
      } else {
        return null;
      }

      const imei = parts[2];
      return imei && imei.trim() ? imei.trim() : null;
    } catch {
      return null;
    }
  }
}
