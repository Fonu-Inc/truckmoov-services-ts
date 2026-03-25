import type {
  DriverCommunicationPreference,
  DriverContactChannels,
} from "../../domain/entities/driver.entity";

export function composeDriverName(input: {
  name?: string;
  firstName?: string;
  lastName?: string;
}) {
  if (input.name?.trim()) {
    return input.name.trim();
  }

  return [input.firstName?.trim(), input.lastName?.trim()]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

export function buildPreferredContactChannelUpdate(input: {
  phone?: string | null;
  communicationPreference?: DriverCommunicationPreference;
}): Partial<DriverContactChannels> {
  const phone = input.phone?.trim();
  if (!phone || !input.communicationPreference) {
    return {};
  }

  switch (input.communicationPreference) {
    case "whatsapp":
      return { whatsappNumber: phone };
    case "sms":
      return { smsNumber: phone };
    case "voice":
      return { voiceNumber: phone };
    case "email":
    default:
      return {};
  }
}
