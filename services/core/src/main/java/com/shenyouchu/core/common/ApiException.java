package com.shenyouchu.core.common;

import org.springframework.http.HttpStatus;

/** 业务异常：携带稳定错误码与 HTTP 状态，由 GlobalExceptionHandler 统一转换。 */
public class ApiException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public ApiException(String code, HttpStatus status, String message) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public String getCode() {
        return code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public static ApiException notFound(String message) {
        return new ApiException("NOT_FOUND", HttpStatus.NOT_FOUND, message);
    }

    public static ApiException conflict(String code, String message) {
        return new ApiException(code, HttpStatus.CONFLICT, message);
    }

    public static ApiException forbidden(String message) {
        return new ApiException("FORBIDDEN", HttpStatus.FORBIDDEN, message);
    }

    public static ApiException unauthenticated(String message) {
        return new ApiException("UNAUTHENTICATED", HttpStatus.UNAUTHORIZED, message);
    }

    public static ApiException validation(String message) {
        return new ApiException("VALIDATION_FAILED", HttpStatus.BAD_REQUEST, message);
    }
}
