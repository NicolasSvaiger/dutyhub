# ============================================
# PlantonHub API - Multi-stage Dockerfile
# ============================================

# Stage 1: Restore dependencies
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS restore
WORKDIR /src

# Copy solution and project files for dependency resolution
COPY PlantonHub.sln .
COPY nuget.config .
COPY src/PlantonHub.Domain/PlantonHub.Domain.csproj src/PlantonHub.Domain/
COPY src/PlantonHub.Application/PlantonHub.Application.csproj src/PlantonHub.Application/
COPY src/PlantonHub.Infrastructure/PlantonHub.Infrastructure.csproj src/PlantonHub.Infrastructure/
COPY src/PlantonHub.API/PlantonHub.API.csproj src/PlantonHub.API/

# Restore dependencies (cached layer)
RUN dotnet restore src/PlantonHub.API/PlantonHub.API.csproj

# Stage 2: Build and publish
FROM restore AS build
WORKDIR /src

# Copy all source code
COPY src/ src/

# Publish the API project
RUN dotnet publish src/PlantonHub.API/PlantonHub.API.csproj \
    -c Release \
    -o /app/publish \
    --no-restore

# Stage 3: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

EXPOSE 5000

ENV ASPNETCORE_URLS=http://+:5000
ENV ASPNETCORE_ENVIRONMENT=Production

# Copy published output
COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "PlantonHub.API.dll"]
