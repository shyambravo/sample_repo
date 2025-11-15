export class HealthService {
  status(): { status: string } {
    return { status: 'ok' };
  }
}


