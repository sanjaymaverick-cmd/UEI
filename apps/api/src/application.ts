import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  Headers,
  HttpCode,
  Module,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import helmet from "helmet";
import { z, ZodError } from "zod";
import { getConfig } from "@uei/config";
import {
  AuthService,
  VehicleService,
  DiscoveryService,
  OrderService,
  PaymentService,
  CallbackService,
  TraceService,
  DomainError,
  phoneSchema,
  idSchema,
  keySchema,
  coordinates,
  secureEqual,
} from "@uei/domain";

const auth = new AuthService();
const vehicles = new VehicleService();
const discovery = new DiscoveryService();
const orders = new OrderService();
const payments = new PaymentService();
const callbacks = new CallbackService();
const traces = new TraceService();
async function actor(header: string | undefined, admin = false) {
  if (!header?.startsWith("Bearer "))
    throw new DomainError("AUTH_REQUIRED", "Please sign in.", 401);
  const user = await auth.authenticate(header.slice(7));
  if (admin && user.role !== "ADMIN")
    throw new DomainError("FORBIDDEN", "Admin access is required.", 403);
  return user;
}
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof DomainError)
      return response.status(error.status).json({
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    if (error instanceof ZodError)
      return response.status(400).json({
        code: "INVALID_INPUT",
        message: "Check the supplied values.",
        retryable: false,
      });
    // Framework parse errors retain their status, while internal errors expose no details.
    const status =
      error &&
      typeof error === "object" &&
      "getStatus" in error &&
      typeof error.getStatus === "function"
        ? Number(error.getStatus())
        : 500;
    return response.status(status).json({
      code: status === 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST",
      message:
        status === 500 ? "Unable to complete the request." : "Invalid request.",
      retryable: status === 500,
    });
  }
}
@Controller("v1")
class ApiController {
  @Get("health") health() {
    return { status: "ok", mode: "simulator" };
  }
  @Post("auth/request-otp") @HttpCode(200) requestOtp(@Body() body: unknown) {
    return auth.requestOtp(
      z.object({ phone: phoneSchema }).strict().parse(body).phone,
    );
  }
  @Post("auth/verify-otp") @HttpCode(200) verifyOtp(@Body() body: unknown) {
    const value = z
      .object({ phone: phoneSchema, otp: z.string().regex(/^\d{6}$/) })
      .strict()
      .parse(body);
    return auth.verifyOtp(value.phone, value.otp);
  }
  @Post("auth/refresh") @HttpCode(200) refresh(@Body() body: unknown) {
    return auth.refresh(
      z
        .object({ refreshToken: z.string().min(32).max(200) })
        .strict()
        .parse(body).refreshToken,
    );
  }
  @Post("auth/logout") @HttpCode(200) logout(@Body() body: unknown) {
    return auth.logout(
      z
        .object({ refreshToken: z.string().min(32).max(200) })
        .strict()
        .parse(body).refreshToken,
    );
  }
  @Get("vehicles/catalogue") async catalogue(
    @Headers("authorization") header?: string,
  ) {
    await actor(header);
    return vehicles.catalogue();
  }
  @Get("vehicles") async myVehicles(@Headers("authorization") header?: string) {
    return vehicles.list((await actor(header)).id);
  }
  @Post("vehicles") async saveVehicle(
    @Body() body: unknown,
    @Headers("authorization") header?: string,
  ) {
    const input = z
      .object({
        variantId: z.string().min(1).max(100),
        nickname: z.string().trim().min(1).max(80),
      })
      .strict()
      .parse(body);
    return vehicles.save(
      (await actor(header)).id,
      input.variantId,
      input.nickname,
    );
  }
  @Post("charging/search") async search(
    @Body() body: unknown,
    @Headers("authorization") header?: string,
  ) {
    return discovery.search(
      (await actor(header)).id,
      z
        .object({ vehicleId: idSchema, ...coordinates })
        .strict()
        .parse(body),
    );
  }
  @Get("charging/search/:id/results") async results(
    @Param("id") id: string,
    @Headers("authorization") header?: string,
  ) {
    return discovery.results((await actor(header)).id, idSchema.parse(id));
  }
  @Post("orders") async select(
    @Body() body: unknown,
    @Headers("idempotency-key") key: string,
    @Headers("authorization") header?: string,
  ) {
    return orders.create(
      (await actor(header)).id,
      z
        .object({ discoveryResultId: idSchema, vehicleId: idSchema })
        .strict()
        .parse(body),
      keySchema.parse(key),
    );
  }
  @Get("orders") async listOrders(@Headers("authorization") header?: string) {
    return orders.list((await actor(header)).id);
  }
  @Get("orders/:id") async order(
    @Param("id") id: string,
    @Headers("authorization") header?: string,
  ) {
    return orders.get((await actor(header)).id, idSchema.parse(id));
  }
  @Post("orders/:id/init") async init(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string,
    @Headers("authorization") header?: string,
  ) {
    z.object({}).strict().parse(body);
    return orders.init(
      (await actor(header)).id,
      idSchema.parse(id),
      keySchema.parse(key),
    );
  }
  @Post("orders/:id/pay") async pay(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string,
    @Headers("authorization") header?: string,
  ) {
    z.object({}).strict().parse(body);
    return payments.pay(
      (await actor(header)).id,
      idSchema.parse(id),
      keySchema.parse(key),
    );
  }
  @Post("callbacks") @HttpCode(200) async callback(
    @Body() body: unknown,
    @Headers("x-callback-secret") secret?: string,
  ) {
    if (!secret || !secureEqual(secret, getConfig().CALLBACK_SECRET))
      throw new DomainError("FORBIDDEN", "Invalid callback credentials.", 403);
    return callbacks.receive(body);
  }
  @Get("admin/transactions") async transactions(
    @Headers("authorization") header?: string,
  ) {
    await actor(header, true);
    return traces.list();
  }
  @Get("admin/transactions/:id") async trace(
    @Param("id") id: string,
    @Headers("authorization") header?: string,
  ) {
    await actor(header, true);
    return traces.detail(idSchema.parse(id));
  }
  @Get("transactions/:id/events") async events(
    @Param("id") id: string,
    @Headers("authorization") header: string,
    @Headers("last-event-id") last: string | undefined,
    @Res() response: Response,
  ) {
    const user = await actor(header);
    idSchema.parse(id);
    let cursor = z.coerce
      .number()
      .int()
      .min(0)
      .max(2147483647)
      .parse(last ?? 0);
    const initial = await traces.events(user.id, id, cursor);
    response.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    response.flushHeaders();
    const send = (events: Awaited<ReturnType<TraceService["events"]>>) => {
      for (const event of events) {
        response.write(
          `id: ${event.id}\nevent: transition\ndata: ${JSON.stringify({ action: event.action, state: event.after, createdAt: event.createdAt })}\n\n`,
        );
        cursor = event.id;
      }
    };
    send(initial);
    let busy = false;
    const timer = setInterval(() => {
      if (busy) return;
      busy = true;
      void actor(header)
        .then(() => traces.events(user.id, id, cursor))
        .then((events) => {
          send(events);
          response.write(": heartbeat\n\n");
        })
        .catch(() => {
          clearInterval(timer);
          response.end();
        })
        .finally(() => {
          busy = false;
        });
    }, 1500);
    response.on("close", () => clearInterval(timer));
  }
}
@Module({ controllers: [ApiController] })
class ApiModule {}
export async function createApi() {
  const config = getConfig();
  const app = await NestFactory.create(ApiModule);
  app.use(helmet());
  app.enableCors({
    origin: config.ADMIN_ORIGIN,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "Last-Event-ID",
    ],
  });
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  return app;
}
