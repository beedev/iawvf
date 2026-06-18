import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { Role } from './roles.enum';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: { signAsync: jest.Mock };

  beforeEach(() => {
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    const configService = {
      get: jest.fn().mockReturnValue({ secret: 'x', expiresIn: '1h' }),
    } as unknown as ConfigService;
    service = new AuthService(
      jwtService as unknown as JwtService,
      configService,
    );
  });

  it('issues a token with the correct claims on valid credentials', async () => {
    const result = await service.login('admin', 'admin-pw');

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.tokenType).toBe('Bearer');
    expect(result.expiresIn).toBe(3600);
    expect(result.username).toBe('admin');
    expect(result.roles).toEqual([Role.Admin]);
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 'admin',
      username: 'admin',
      roles: [Role.Admin],
    });
  });

  it('throws UnauthorizedException on invalid credentials', async () => {
    await expect(service.login('admin', 'bad')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });
});
